import { SelfBackendVerifier, UserIdType, ConfigMismatchError } from '@selfxyz/core';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Simple configuration storage
class SimpleConfigStorage {
  async getConfig(configId) {
    return {
      olderThan: 15,
      excludedCountries: ['', ''],
      ofac: true,
      nationality: true,
      name: true,
      dateOfBirth: true,
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
  'contriboost',
  process.env.NEXT_PUBLIC_VERIFY_ENDPOINT,
  process.env.NODE_ENV !== 'production',
  allowedIds,
  new SimpleConfigStorage(),
  UserIdType.UUID
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { attestationId, proof, pubSignals, userContextData, userId } = req.body;

    if (!attestationId || !proof || !pubSignals || !userContextData || !userId) {
      return res.status(400).json({
        status: 'error',
        result: false,
        reason: 'Missing required fields',
        error_code: 'MISSING_FIELDS',
      });
    }

    // Verify the proof
    const result = await selfBackendVerifier.verify(
      attestationId,
      proof,
      pubSignals,
      userContextData
    );

    if (result.isValidDetails.isValid) {
      // Store verification in Supabase
      const { error } = await supabase
        .from('verifications')
        .upsert({
          user_id: userId.toLowerCase(),
          verified: true,
          timestamp: Date.now(),
          attestation_id: attestationId,
          disclose_output: result.discloseOutput,
        });

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({
          status: 'error',
          result: false,
          reason: 'Database error',
          error_code: 'DATABASE_ERROR',
        });
      }

      return res.status(200).json({
        status: 'success',
        result: true,
        credentialSubject: result.discloseOutput,
      });
    } else {
      return res.status(200).json({
        status: 'error',
        result: false,
        reason: 'Verification failed',
        error_code: 'VERIFICATION_FAILED',
        details: result.isValidDetails,
      });
    }
  } catch (error) {
    console.error('Error verifying proof:', error);
    if (error instanceof ConfigMismatchError) {
      return res.status(200).json({
        status: 'error',
        result: false,
        reason: 'Configuration mismatch',
        error_code: 'CONFIG_MISMATCH',
        issues: error.issues,
      });
    }

    return res.status(200).json({
      status: 'error',
      result: false,
      reason: 'Internal error',
      error_code: 'INTERNAL_ERROR',
    });
  }
}