-- uniauth phase 7: sign-in lives only in uniauth (docs/uniauth/planning-oidc.md).
--
-- Password hashes and Google/Microsoft links were copied to uniauth at the cutover
-- (uniauth's scripts/import-unishare.ts). unishare keeps only its providerId 'uniauth' rows,
-- which map a uniauth user to the local one.
DELETE FROM "account" WHERE "providerId" IN ('credential', 'google', 'microsoft');

-- unishare's own MCP authorization server (Better Auth mcp plugin). uniauth issues MCP
-- tokens now; unishare only verifies them.
DROP TABLE "oauth_consent";
DROP TABLE "oauth_access_token";
DROP TABLE "oauth_application";
