import { NextResponse } from "next/server";
import { 
    SelfBackendVerifier, 
    DefaultConfigStore, 
    AttestationId 
} from "@selfxyz/core";

// --- SELF CONFIGURATION ---
const SELF_SCOPE = "contriboost";
const SELF_ENDPOINT = "https:/www.contriboost.xyz/api/verify";
const MINIMUM_AGE = 15;
const EXCLUDED_COUNTRIES = []; 
const OFAC_CHECK = false; 
// --------------------------

// Global variable to store the instance (Singleton Pattern)
let verifierInstance = null;

// Helper function to create or return the existing verifier
// This prevents the code from running during "next build"
function getVerifier() {
    if (!verifierInstance) {
        // Define the specific attestations you want to support
        const EnabledIds = [
            AttestationId.MINIMUM_AGE,
            AttestationId.NATIONALITY,
            AttestationId.OFAC
        ];

        console.log("Initializing SelfBackendVerifier...");

        verifierInstance = new SelfBackendVerifier(
            SELF_SCOPE,
            SELF_ENDPOINT,
            false, // staging/devMode
            EnabledIds,
            new DefaultConfigStore({
                minimumAge: MINIMUM_AGE,
                excludedCountries: EXCLUDED_COUNTRIES,
                ofac: OFAC_CHECK,
            }),
            "hex" 
        );
    }
    return verifierInstance;
}

export async function POST(req) {
    try {
        const { attestationId, proof, publicSignals, userContextData } = await req.json();

        if (!proof || !publicSignals || !attestationId || !userContextData) {
            return NextResponse.json(
                { status: "error", message: "Missing required proof inputs." },
                { status: 200 }
            );
        }

        // Initialize verifier ONLY when the request comes in (Runtime)
        const verifier = getVerifier();

        const result = await verifier.verify(
            attestationId,
            proof,
            publicSignals,
            userContextData
        );

        if (result.isValidDetails.isValid && result.isValidDetails.isMinimumAgeValid) {
            const { userIdentifier } = result.userData;
            console.log(`Proof validated for user: ${userIdentifier}`);

            return NextResponse.json({
                status: "success",
                result: true,
                message: "Identity verified.",
            }, { status: 200 });
        } else {
            const reason = result.isValidDetails.isMinimumAgeValid ? "Proof failed hub check." : "Did not meet age/rule requirements.";
            
            return NextResponse.json(
                { status: "error", result: false, reason: reason, details: result.isValidDetails },
                { status: 200 }
            );
        }
    } catch (error) {
        console.error("Self Verification API Error:", error);
        return NextResponse.json(
            { status: "error", result: false, reason: error.message || "Unknown server error." },
            { status: 200 }
        );
    }
}