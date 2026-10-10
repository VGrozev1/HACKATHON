// Operator accounts for the operator dashboard (everything outside /owner). Demo login
// only: salted scrypt hashes here, plain passwords in docs/DEMO-ACCOUNTS.md.
// Server code only (src/lib/auth.ts): never import this into a client component.

export interface OperatorAccount {
  id: string;
  name: string;
  username: string;
  /** "scrypt$<salt hex>$<hash hex>" */
  passwordHash: string;
}

export const operatorAccounts: OperatorAccount[] = [
  {
    id: "op-01",
    name: "VendAI Operations",
    username: "operator",
    passwordHash: "scrypt$bbf914c7faee73c9104b9af45b7f42f6$b2d811958facadae84308b1db349ec31ada31cb8498c5a0cc104fa137af94727",
  },
];
