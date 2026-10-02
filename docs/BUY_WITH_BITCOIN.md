# Buy with Bitcoin

Every home for sale (and every bank sale) has a **Buy with Bitcoin** button with the Bitcoin symbol: on the card in
listings, and on the property page under the price. It shows the price in Bitcoin at the live rate and lets the buyer
choose Bitcoin, Ether, Tether (USDT), USD Coin (USDC) or another digital currency.

## What it does and does not do

- It takes a **purchase request** (name, email, phone, coin, note). Admin → **Crypto buyers** lists them with the rate
  that was shown, and the team, the listing owner and the buyer are told. The buyer's email carries a reference and the
  anti-fraud rule.
- It **does not take money.** No coin is sent from the site. After the seller agrees to accept digital currency and the
  buyer's identity and source of funds are checked, the team sends *written* payment instructions for an escrow or the
  seller's lawyer. The sale and title transfer are documented in the listing's currency at a rate agreed in writing.
- The wallet address in `btc-qr.ts` (tour passes) is not used. Taking reservation deposits on the site would need
  finance and legal sign-off first (see the header of `btc-payments.ts`).

## Rates

Live prices come from free feeds that need no key: Coinbase, then CoinGecko, then mempool.space for Bitcoin; open.er-api.com
for currency conversion (UGX, KES, TZS, …), falling back to the UGX rate set in Admin → Payments. A reading is cached for a
minute. If every feed is down the last reading is shown, marked as old, for up to six hours; after that the page shows no
amount and says the team will confirm it. It never invents a price.

## Turning it off / changing it

Admin → Crypto buyers: switch the button on or off, choose which coins are offered, and add a message for buyers (for
example "Sellers decide whether they accept digital currency").

## Legal

Digital currency is not legal tender in Uganda and many other countries; the seller is never obliged to accept it. The AML
page (`/aml-sanctions`, section 4) describes the checks. Have a lawyer review it before you rely on it.
