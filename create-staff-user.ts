// Supabase Edge Function: create-staff-user
// Deploy via: Supabase Dashboard -> Edge Functions -> Deploy a new function -> Via Editor
// Paste this whole file in, name the function "create-staff-user", and deploy.
//
// What it does: lets an ACTIVE ADMIN create a brand-new staff login for the
// Maleektech app, without ever putting the service_role key in the browser.
// The service_role key is only used here, server-side, and only after
// confirming the person calling this function is really an active admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonResponse = (body, status) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // This client runs AS the person calling the function (their own JWT),
    // so it's still subject to normal Row Level Security.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Not authenticated" }, 401);

    // Confirm the caller is an ACTIVE ADMIN in Maleektech's own profiles table
    // before doing anything privileged. This is the real gate — never trust
    // the frontend alone to enforce this.
    const { data: profile, error: profileErr } = await callerClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile || profile.role !== "admin" || !profile.is_active) {
      return jsonResponse({ error: "Only an active admin can create staff accounts" }, 403);
    }

    const { email, password, full_name } = await req.json();
    if (!email || !password) return jsonResponse({ error: "Email and password are required" }, 400);
    if (password.length < 6) return jsonResponse({ error: "Password must be at least 6 characters" }, 400);

    // Only NOW do we touch the service_role key, and only for this one call.
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email },
    });

    if (createErr) return jsonResponse({ error: createErr.message }, 400);

    return jsonResponse({ success: true, id: created.user.id, email: created.user.email }, 200);
  } catch (e) {
    return jsonResponse({ error: e.message || "Unexpected error" }, 500);
  }
});
