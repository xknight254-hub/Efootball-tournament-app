## Payment Flow
1. User creates wager with stake amount
2. Frontend calls POST /api/wagers with stakeAmount + phoneNumber
3. Server calls Paynecta STK Push via paynectaService.ts
4. Paynecta sends M-Pesa prompt to user's phone
5. User pays via M-Pesa
6. Paynecta webhook → POST /api/paynecta/webhook
7. Server verifies payment and updates wager status

## Subscription Tiers (Paynecta hosted LINK)
- Rookie: KES 250/mo, 5 tournaments
- Growth: KES 500/mo, 15 tournaments
- Scale: KES 1000/mo, 50 tournaments, sub-admin
- Enterprise: KES 5000/mo, unlimited, sub-admin