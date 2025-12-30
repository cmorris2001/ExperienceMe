// supabaseClient.js
const SUPABASE_URL = "https://chfkjushdamzrnzpjvig.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoZmtqdXNoZGFtenJuenBqdmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMjg0MjIsImV4cCI6MjA3NzkwNDQyMn0.0dAg2pP9K4Ug2FwsIAfFf0MTReFqtmHTBXydJ6zt0nY";

// create client and attach it to window so other scripts can use it
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("Supabase client initialised:", window.supabaseClient);
