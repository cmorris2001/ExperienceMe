// Supabase Client Configuration with URL and KeY
const SUPABASE_URL = 'https://chfkjushdamzrnzpjvig.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoZmtqdXNoZGFtenJuenBqdmlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzMjg0MjIsImV4cCI6MjA3NzkwNDQyMn0.0dAg2pP9K4Ug2FwsIAfFf0MTReFqtmHTBXydJ6zt0nY';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other files
window.supabaseClient = supabase;
// Console line for debugging purposes
console.log('Supabase client initialized successfully');
