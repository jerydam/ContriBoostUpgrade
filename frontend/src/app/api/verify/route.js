import { SelfBackendVerifier } from '@selfxyz/core';
import { createClient } from '@supabase/supabase-js';

// ConfigMismatchError fallback (may not be exported in current version)
class ConfigMismatchError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'ConfigMismatchError';
    this.issues = issues;
  }
}

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Configuration storage that matches frontend exactly
class SimpleConfigStorage {
  async getConfig(configId) {
    return {
      olderThan: 15, // This maps to minimumAge: 15 in frontend
      excludedCountries: [], // Empty array, not ["", ""]
      ofac: true,
    };
  }

  async getActionId(userIdentifier, userDefinedData) {
    return 'default_config';
  }
}

// Initialize SelfBackendVerifier
const allowedIds = new Map();
allowedIds.set(1, true); // Passports
allowedIds.set(2, true); // EU ID cards

const selfBackendVerifier = new SelfBackendVerifier(
  'contriboost', // Must match frontend scope
  process.env.NEXT_PUBLIC_VERIFY_ENDPOINT,
  process.env.NODE_ENV !== 'production', // true for testing, false for production
  allowedIds,
  new SimpleConfigStorage(),
  'hex' // Use 'hex' for wallet addresses, 'uuid' for traditional UUIDs
);

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      message: 'Method not allowed',
      allowed: ['POST'] 
    });
  }

  try {
    console.log('Verification request received:', {
      hasAttestationId: !!req.body.attestationId,
      hasProof: !!req.body.proof,
      hasPubSignals: !!req.body.pubSignals,
      hasUserContextData: !!req.body.userContextData,
      body: req.body
    });

    const { attestationId, proof, pubSignals, userContextData } = req.body;

    // Validate required fields
    if (!attestationId || !proof || !pubSignals || !userContextData) {
      console.error('Missing required fields:', {
        attestationId: !!attestationId,
        proof: !!proof,
        pubSignals: !!pubSignals,
        userContextData: !!userContextData
      });

      return res.status(400).json({
        status: 'error',
        result: false,
        reason: 'Missing required fields',
        error_code: 'MISSING_FIELDS',
        required: ['attestationId', 'proof', 'pubSignals', 'userContextData']
      });
    }

    // Extract userId from userContextData
    const userId = userContextData.userId;
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        result: false,
        reason: 'UserId not found in userContextData',
        error_code: 'MISSING_USER_ID',
      });
    }

    console.log('Verifying proof for user:', userId);

    // Verify the proof using SelfBackendVerifier
    const result = await selfBackendVerifier.verify(
      attestationId,
      proof,
      pubSignals,
      userContextData
    );

    console.log('Verification result:', {
      isValid: result.isValidDetails.isValid,
      userId: userId,
      discloseOutput: result.discloseOutput
    });

    if (result.isValidDetails.isValid) {
      // Store verification in Supabase
      const { data, error } = await supabase
        .from('verifications')
        .upsert({
          user_id: userId.toLowerCase(),
          verified: true,
          timestamp: new Date().toISOString(),
          attestation_id: attestationId,
          disclose_output: result.discloseOutput,
          proof_data: {
            attestationId,
            userContextData,
            timestamp: Date.now()
          }
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Supabase storage error:', error);
        return res.status(500).json({
          status: 'error',
          result: false,
          reason: 'Database storage error',
          error_code: 'DATABASE_ERROR',
          details: error.message
        });
      }

      console.log('Verification stored successfully for user:', userId);

      return res.status(200).json({
        status: 'success',
        result: true,
        message: 'Verification successful',
        credentialSubject: result.discloseOutput,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('Verification failed:', result.isValidDetails);
      
      return res.status(200).json({
        status: 'error',
        result: false,
        reason: 'Verification failed',
        error_code: 'VERIFICATION_FAILED',
        details: result.isValidDetails,
      });
    }
  } catch (error) {
    console.error('Error in verification handler:', error);
    
    if (error instanceof ConfigMismatchError) {
      console.error('Configuration mismatch:', error.issues);
      return res.status(400).json({
        status: 'error',
        result: false,
        reason: 'Configuration mismatch between frontend and backend',
        error_code: 'CONFIG_MISMATCH',
        issues: error.issues,
        hint: 'Ensure frontend and backend disclosure configurations match exactly'
      });
    }

    return res.status(500).json({
      status: 'error',
      result: false,
      reason: 'Internal server error',
      error_code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal error occurred'
    });
  }
}