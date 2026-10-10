# Demo accounts

Logins for VendAI (sign in at `/login`). Demo only: they exist so judges can see the operator dashboard and one investor with several machines. Don't reuse these passwords anywhere else.

## Operator (the dashboard: Fleet, Run night, Orders, Simulation, Investor)

| Account | Username | Password | Access | |
| --- | --- | --- | --- | --- |
| VendAI Operations | `operator` | `delta-meadow-7466` | everything except the investor portal | |

## Investors (the investor portal at /owner)

| Investor | Username | Password | Machines | Machine ids |
| --- | --- | --- | --- | --- |
| Lozenets Capital | `lozenets` | `amber-canyon-4340` | 2 | SOF-GYM-01, SOF-OFF-08 |
| Vitosha Ventures | `vitosha` | `delta-amber-4108` | 1 | SOF-GYM-07 |
| Serdika Holdings | `serdika` | `orbit-orbit-8122` | 4 | SOF-HOS-01, SOF-HOS-02, SOF-OFF-03, SOF-UNI-01 |
| Iskar Invest | `iskar` | `falcon-maple-7502` | 3 | SOF-GYM-05, SOF-OFF-01, SOF-OFF-02 |
| Mladost Partners | `mladost` | `delta-beacon-5615` | 3 | SOF-GYM-02, SOF-GYM-04, SOF-OFF-06 |

- Each investor only sees their own machines; opening another machine's page sends them back to their list.
- Passwords are stored as salted scrypt hashes in `src/mocks/investors.ts`. To change one, regenerate the hash (see the comment there) and update this table.
- Sessions are signed with `AUTH_SECRET` (see `.env.example`). Without it, the key is derived from `DATABASE_URL`, which every deployment already has; local development with neither uses a built-in development key.
