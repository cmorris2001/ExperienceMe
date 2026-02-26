// Supabase Client Configuration with URL and KeY
const SUPABASE_URL = 'https://chfkjushdamzrnzpjvig.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoZmtqdXNoZGFtenJuenBqdmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMjg0MjIsImV4cCI6MjA3NzkwNDQyMn0.0dAg2pP9K4Ug2FwsIAfFf0MTReFqtmHTBXydJ6zt0nY';

// lib/supabaseClient.js

// These must exist (define them above this line)
// const SUPABASE_URL = "...";
// const SUPABASE_ANON_KEY = "...";

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("Supabase client initialized successfully");
