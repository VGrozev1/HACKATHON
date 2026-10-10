// Demo investor accounts for the investor portal (/owner). Demo login only: passwords
// are stored as salted scrypt hashes; the plain passwords are in docs/DEMO-ACCOUNTS.md.
// inv-01 and inv-02 match Todor's seed (src/lib/sim/fleet.ts INVESTORS); inv-03 and
// inv-04 are new and need the same rows in his seed for real data to match.
// Server code only (src/lib/auth.ts): never import this into a client component.
//
// New hash for a password (prints a scrypt$<salt>$<hash> string to paste below):
//   node -e "const c=require('crypto'),s=c.randomBytes(16);console.log(['scrypt',s.toString('hex'),c.scryptSync(process.argv[1],s,32).toString('hex')].join(String.fromCharCode(36)))" "new-password"

export interface InvestorAccount {
  id: string;
  name: string;
  username: string;
  /** "scrypt$<salt hex>$<hash hex>" */
  passwordHash: string;
  /** A fixed monthly rent, B share of sales, C share of net profit. */
  payoutModel: "A" | "B" | "C";
  /** A: € per month; B and C: share as 0–1. */
  payoutValue: number;
  machineIds: string[];
}

export const investorAccounts: InvestorAccount[] = [
  {
    id: "inv-01",
    name: "Lozenets Capital",
    username: "lozenets",
    passwordHash: "scrypt$206a67055dffd411c24ef4cd7c9ae7f4$e068626e9d5cb13e79011b7863d98d3f8d74f28c86977a28afbff61d56b292ac",
    payoutModel: "B",
    payoutValue: 0.2,
    machineIds: [
      "SOF-GYM-01",
      "SOF-OFF-08"
    ]
  },
  {
    id: "inv-02",
    name: "Vitosha Ventures",
    username: "vitosha",
    passwordHash: "scrypt$73d08a93f0df87dd339b0889b41032c1$5c8d2a7c9f8d2259ca603c0ef90482d204a2b7b88d6d3eb90b157466798709f5",
    payoutModel: "A",
    payoutValue: 120,
    machineIds: [
      "SOF-GYM-07"
    ]
  },
  {
    id: "inv-03",
    name: "Serdika Holdings",
    username: "serdika",
    passwordHash: "scrypt$3b8a8e328685a9cf7962da355e94889d$c8aa5f60e372915b1af8cc6ea87b4a0675ce7ed41a363e0418b9fee16ac48be8",
    payoutModel: "C",
    payoutValue: 0.5,
    machineIds: [
      "SOF-HOS-01",
      "SOF-HOS-02",
      "SOF-OFF-03",
      "SOF-UNI-01"
    ]
  },
  {
    id: "inv-04",
    name: "Iskar Invest",
    username: "iskar",
    passwordHash: "scrypt$5a784191d1cbfae33fd3bfb6c3c0dd7b$ba09c2dd4389f1666820d25a8c287bb022be77a4b8b56fdea6bda5bfba9698d8",
    payoutModel: "B",
    payoutValue: 0.15,
    machineIds: [
      "SOF-GYM-05",
      "SOF-OFF-01",
      "SOF-OFF-02"
    ]
  },
  {
    id: "inv-05",
    name: "Mladost Partners",
    username: "mladost",
    passwordHash: "scrypt$5eafb7c19b79f10d726d50adc7bc5152$abfba0ee0d9d0fec3b4dc5f06ad21cd8c88426a609fd08ce316241edf3bbabfb",
    payoutModel: "C",
    payoutValue: 0.4,
    machineIds: ["SOF-GYM-02", "SOF-GYM-04", "SOF-OFF-06"],
  },
];
