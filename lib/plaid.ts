import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;

if (!PlaidEnvironments[env]) {
  throw new Error(`Invalid PLAID_ENV "${env}". Must be sandbox | development | production.`);
}

if (!process.env.PLAID_CLIENT_ID) {
  console.warn("[plaid] WARNING: PLAID_CLIENT_ID is not set — API calls will fail");
}
if (!process.env.PLAID_SECRET) {
  console.warn("[plaid] WARNING: PLAID_SECRET is not set — API calls will fail");
}

console.log(`[plaid] env: ${env}`);

const configuration = new Configuration({
  basePath: PlaidEnvironments[env],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
      "PLAID-SECRET": process.env.PLAID_SECRET ?? "",
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
