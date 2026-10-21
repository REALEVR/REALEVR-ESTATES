# Country spots

A few promoted places per country, bought by owners in that country, paid in that country's money, and managed by the owner (and a local country manager).

## Open a country (Admin > Country spots)
1. Switch "Sell spots" on, set the number of spots (default 6, max 24).
2. Enter the local-money rate (units per US dollar). Empty means US dollars. Plans are US$3 / 9 / 22 for 1 week / 1 month / 3 months, rounded up to 3 figures in local money; any plan can be overridden per country.
3. Enter where the money goes: method, account name, number. **A country cannot sell until it has a payee.** Payers are told to check the account name before they confirm.
4. Optional: appoint country managers (account numbers). A manager confirms payments and pauses spots in their country; only an administrator can change the payee or the rate.
5. Optional: "Make a forwarding token". The payee's phone forwards each received-money message to `/api/country-spots/inbound/<CODE>` with header `x-payment-token`. A receipt that carries the spot's reference (`CS<CODE>xxxxxxxx`) and the full price in the country's currency switches the spot on by itself. Without it the manager confirms by hand.

## Who can buy
- The account's phone has the country's dialling code (shown as "paid from here"). This shows where a person is reachable, not their passport.
- The listing is in that country and belongs to the buyer.
- A listing holds at most one spot. A request holds a spot for 24 h unpaid, 7 days once a transaction id is sent, then is released.

## The owner's side (/promotions)
Take a spot, see the payee and reference, send the transaction id, then watch views since the spot began, move the spot to another of their listings (once a day) or cancel before paying.

## Where it shows
"Promoted in <country>" on the home page for visitors in that country and on `/homes/<country>`, and a "Promoted" label on the card. The label says plainly it is a paid place.

## Limits
Receipts prove a message arrived, not that money is in the account; matching reads English "received/credited" messages and the currency code or common abbreviation (KES/Ksh, TZS/TSh, UGX/Ush, GHS/GH₵, NGN/₦, RWF/FRw...). Anything else stays for the manager. Data lives in the JSON store and is mirrored to the database, like auctions.
