import { NextResponse } from "next/server";
import {
  SelfBackendVerifier,
  DefaultConfigStore,
  AttestationId,
  ATTESTATION_ID,
} from "@selfxyz/core";

// ============================================================================
// CONFIGURATION - PRODUCTION SETTINGS
// ============================================================================

const SELF_SCOPE = "contriboost"; // Must match frontend scope
const SELF_ENDPOINT = "https://www.contriboost.xyz/api/verify";
const MINIMUM_AGE = 15; // Production typically requires 18+
const EXCLUDED_COUNTRIES = []; // OFAC sanctioned countries
const OFAC_CHECK = false; // Enable OFAC screening in production

// Hub addresses - use mainnet for production
const CELO_MAINNET_HUB = "0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF";

// ============================================================================
// SINGLETON VERIFIER INSTANCE
// ============================================================================

let verifierInstance = null;

function getVerifier() {
  if (!verifierInstance) {
    const EnabledIds = [
      AttestationId.MINIMUM_AGE,
      AttestationId.NATIONALITY,
      AttestationId.OFAC,
    ];

    console.log("🔐 Initializing SelfBackendVerifier for Production...");

    verifierInstance = new SelfBackendVerifier(
      SELF_SCOPE,
      SELF_ENDPOINT,
      false, // ✓ Production: false for mainnet, true for staging
      EnabledIds,
      new DefaultConfigStore({
        minimumAge: MINIMUM_AGE,
        excludedCountries: EXCLUDED_COUNTRIES,
        ofac: OFAC_CHECK,
      }),
      "hex" // User identifier type
    );

    console.log("✓ SelfBackendVerifier initialized");
  }
  return verifierInstance;
}

// ============================================================================
// VERIFICATION HANDLER
// ============================================================================

export async function POST(req) {
  const startTime = Date.now();

  try {
    // 1. Parse request body
    const body = await req.json();
    const { attestationId, proof, publicSignals, userContextData } = body;

    console.log("📥 Verification request received");
    console.log(`   Attestation ID: ${attestationId}`);
    console.log(`   User Context: ${userContextData?.substring(0, 20)}...`);

    // 2. Validate required fields
    if (!proof || !publicSignals || !attestationId || !userContextData) {
      console.warn("⚠️  Missing required proof inputs");
      return NextResponse.json(
        {
          status: "error",
          message: "Missing required proof inputs (proof, publicSignals, attestationId, userContextData).",
          code: "INVALID_INPUT",
        },
        { status: 200 }
      );
    }

    // 3. Validate attestation ID
    if (
      attestationId !== ATTESTATION_ID.MINIMUM_AGE &&
      attestationId !== ATTESTATION_ID.NATIONALITY &&
      attestationId !== ATTESTATION_ID.OFAC
    ) {
      console.warn(`⚠️  Invalid attestation ID: ${attestationId}`);
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid attestation ID",
          code: "INVALID_ATTESTATION_ID",
        },
        { status: 200 }
      );
    }

    // 4. Initialize verifier
    const verifier = getVerifier();

    // 5. Verify proof against hub and config
    console.log("🔍 Verifying proof against Identity Verification Hub...");
    const result = await verifier.verify(
      attestationId,
      proof,
      publicSignals,
      userContextData
    );

    console.log("📊 Verification Details:", {
      isValid: result.isValidDetails.isValid,
      isMinimumAgeValid: result.isValidDetails.isMinimumAgeValid,
      isOfacValid: result.isValidDetails.isOfacValid,
    });

    // 6. Extract user data
    const { userIdentifier } = result.userData;
    const userAddress = `0x${userIdentifier.substring(userIdentifier.length - 40)}`;

    console.log(`👤 User Identifier: ${userIdentifier}`);
    console.log(`📍 User Address: ${userAddress}`);

    // 7. Check all verification requirements
    if (
      !result.isValidDetails.isValid ||
      !result.isValidDetails.isMinimumAgeValid
    ) {
      let reason = "Proof validation failed";

      if (!result.isValidDetails.isValid) {
        reason = "Proof failed hub verification";
      } else if (!result.isValidDetails.isMinimumAgeValid) {
        reason = `User does not meet minimum age requirement of ${MINIMUM_AGE}`;
      }

      console.warn(`❌ Verification failed: ${reason}`);

      return NextResponse.json(
        {
          status: "error",
          result: false,
          reason: reason,
          code: "VERIFICATION_FAILED",
          details: result.isValidDetails,
        },
        { status: 200 }
      );
    }

    // 8. Check OFAC if enabled
    if (OFAC_CHECK && result.isValidDetails.isOfacValid === false) {
      console.warn("❌ User failed OFAC screening");
      return NextResponse.json(
        {
          status: "error",
          result: false,
          reason: "User failed OFAC compliance screening",
          code: "OFAC_BLOCKED",
        },
        { status: 200 }
      );
    }

    // 9. Check excluded countries if configured
    if (EXCLUDED_COUNTRIES.length > 0) {
      const userNationality = result.discloseOutput?.nationality;
      if (
        userNationality &&
        EXCLUDED_COUNTRIES.includes(userNationality)
      ) {
        console.warn(
          `❌ User from excluded country: ${userNationality}`
        );
        return NextResponse.json(
          {
            status: "error",
            result: false,
            reason: `Access not available from country: ${userNationality}`,
            code: "COUNTRY_BLOCKED",
          },
          { status: 200 }
        );
      }
    }

    // 10. SUCCESS - All verifications passed
    const verificationTime = Date.now() - startTime;
    console.log(`✅ Verification successful in ${verificationTime}ms`);
    console.log(`   User: ${userAddress}`);
    console.log(`   Age: ${result.discloseOutput?.olderThan}+`);

    // 11. Optional: Store verification record
    try {
      await storeVerificationRecord({
        userAddress,
        userIdentifier,
        attestationId,
        timestamp: new Date().toISOString(),
        nationality: result.discloseOutput?.nationality,
        age: result.discloseOutput?.olderThan,
      });
    } catch (storageError) {
      console.error("⚠️  Failed to store verification record:", storageError);
      // Don't fail the verification due to storage issues
    }

    return NextResponse.json(
      {
        status: "success",
        result: true,
        message: "Identity verified successfully",
        user: {
          address: userAddress,
          identifier: userIdentifier,
          verified_at: new Date().toISOString(),
        },
        verification_details: {
          age_verified: result.isValidDetails.isMinimumAgeValid,
          ofac_verified: OFAC_CHECK ? result.isValidDetails.isOfacValid : null,
          nationality: result.discloseOutput?.nationality,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Verification Error:", error);

    return NextResponse.json(
      {
        status: "error",
        result: false,
        reason: error.message || "Unknown server error",
        code: "SERVER_ERROR",
      },
      { status: 200 }
    );
  }
}

// ============================================================================
// HELPER: Store Verification Record
// ============================================================================

async function storeVerificationRecord(data) {
  // Example: Store in your database (Supabase, Firebase, etc.)
  // This is a placeholder - implement based on your backend

  if (process.env.NEXT_PUBLIC_USE_DATABASE === "true") {
    // Example with Supabase
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    const { error } = await supabase
      .from("verified_users")
      .insert([
        {
          user_address: data.userAddress,
          user_identifier: data.userIdentifier,
          attestation_id: data.attestationId,
          nationality: data.nationality,
          age_verified: data.age,
          verified_at: data.timestamp,
        },
      ]);

    if (error) throw error;
  }

  console.log("✓ Verification record stored");
}