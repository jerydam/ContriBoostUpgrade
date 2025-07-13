import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;
    const { data, error } = await supabase
      .from('verifications')
      .select('*')
      .eq('user_id', userId.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: No rows found
      console.error('Supabase error:', error);
      return res.status(500).json({
        status: 'error',
        verified: false,
        reason: 'Database error',
        error_code: 'DATABASE_ERROR',
      });
    }

    if (data && data.verified) {
      return res.status(200).json({
        status: 'success',
        verified: true,
        timestamp: data.timestamp,
        attestationId: data.attestation_id,
        discloseOutput: data.disclose_output,
      });
    } else {
      return res.status(200).json({
        status: 'success',
        verified: false,
      });
    }
  } catch (error) {
    console.error('Error checking verification status:', error);
    return res.status(200).json({
      status: 'success',
      verified: false,
    });
  }
}