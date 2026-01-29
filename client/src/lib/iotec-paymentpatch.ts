/**
 * This one will actually send the payment 
    request to actually return the access token
 */
interface IReturnToken {
    error: boolean
    accessToken: string
    errorMessage: string
}
export async function sendPaymentRequest(): Promise<IReturnToken> {
    let accessToken = null
    try {
        console.log("WILL-FETCH-TOKEN")

        const res = await fetch('/api/payment/iotec/token', {
            method: 'POST',
        })
        console.log("DID-SEND-REQUEST")
        

        const data = await res.json()

        console.log("FETCHED-DATA",data)
        if (!data.access_token) {
        console.log("NO-WILL-FETCH-TOKEN")

            throw new Error('No access_token returned')
        }

        accessToken = data.access_token
        console.log("DID-RECIEIVE-TOKEN",accessToken)

        return {
            accessToken: accessToken,
            error: false,
            errorMessage: '',
        }
    } catch (err) {
        return {
            accessToken: accessToken,
            error: true,
            //@ts-ignore
            errorMessage: err.message,
        }
    }
}


/**
 * Create PaymentLink with token and amount
 */

export function generatePaymentLink(accessToken:string,amount:string){
    let urlLink = `/vss-payment-gate/${accessToken}/${amount}`;
    return urlLink;
}

/**
 * Navigate URL to Payment tile
 * This makes a forced navigation
 */

export function navigateUserToPaymentTile(link:string){

    window.location.href = link;
}