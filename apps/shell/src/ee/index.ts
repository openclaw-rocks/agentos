/**
 * Enterprise/Hosted edition features for AgentOS (openclaw.rocks).
 *
 * This directory contains features exclusive to the hosted version:
 * - Simplified onboarding (no raw Matrix URLs)
 * - Managed space creation
 * - Account management (password reset, email verification)
 * - Billing and subscription management
 * - Auto-provisioning of Tuwunel instances via the operator
 * - Auto-provisioning of OpenClaw agent instances
 *
 * All exports are gated behind isHosted() checks in the main app.
 * In open-source builds (VITE_IS_HOSTED !== "true"), this code is
 * tree-shaken out by Vite.
 *
 * Pattern for adding hosted features:
 *
 *   // In the main app component:
 *   import { isHosted } from "../lib/platform";
 *
 *   // Lazy-load hosted-only component
 *   const HostedOnboarding = lazy(() =>
 *     import("../ee/onboarding").then(m => ({ default: m.HostedOnboarding }))
 *   );
 *
 *   // Conditionally render
 *   {isHosted() ? <HostedOnboarding /> : <MatrixLoginScreen />}
 */

export {};
