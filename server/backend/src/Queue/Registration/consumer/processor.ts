import { BasicModel, setupDbConnection } from "@karya/common";
import { FundAccountRequest, ContactsRequest, ContactsResponse, PaymentsAccountRecord, RecordNotFoundError, WorkerRecord, FundAccountType, FundAccountResponse } from "@karya/core";
import { Job } from "bullmq";
import {AxiosResponse} from 'axios'
import { razorPayAxios } from "../../HttpUtils";
import { RegistrationQJobData } from "../Types";

const SERVER_ADD_ACCOUNT_RELATIVE_URL = 'api_box/payments/accounts'
const RAZORPAY_CONTACTS_RELATIVE_URL = 'contacts'
const RAZORPAY_FUND_ACCOUNT_RELATIVE_URL = 'fund_accounts'

// Setting up Db Connection
setupDbConnection();

export default async (job: Job<RegistrationQJobData>) => {
    // Get the box record
    // TODO @enhancement: Maybe cache the id_token rather than calling the database every time
    let accountRecord: PaymentsAccountRecord = job.data.accountRecord
    try {
        const contactsId = await getContactsID(accountRecord.worker_id)
        let fundsId = await createAndSaveFundsId(accountRecord, contactsId)
    } catch (e: any) {

        // TODO: Handle error for the case where accountRecord cannot be fetched from database
        // Possible Handling: Move the job to failed stage and keep retrying
        // sending the account record for registration

        // TODO: Log the error here
        console.error(e)
        let updatedRecordMeta = accountRecord!.meta
        // Update the record to status failed with faluire reason
        // TODO: Set the type of meta to be any
        // @ts-ignore adding property to meta field
        updatedRecordMeta["failure_reason"] = `Failure inside Registration Account Queue Processor at box | ${e.message}`;
        // BasicModel.updateSingle('payments_account', { id: job.data.account_record_id}, { status: AccountTaskStatus.FAILED, meta: updatedRecordMeta })
    }
}

// TODO: @Refacotor: Maybe encapsulate these functions in a 'Razorpay' class
/**
 * 
 * @param workerId
 * @returns contacts Id for the worker
 * 
 */
const getContactsID = async (workerId: string) => {
    let workerRecord: WorkerRecord
    try {
        workerRecord = await BasicModel.getSingle('worker', { id: workerId })
    } catch (e) {
        throw new RecordNotFoundError("Could not find worker record with given id in accounts record")
    }
    // Check if contactsId already exists in the worker record
    const payments_meta = workerRecord!.payments_meta
    if (payments_meta && (payments_meta as any).contacts_id) {
        const contactsId = (payments_meta as any).contacts_id
        return contactsId
    }
    // Contacts ID doesnot exist, make a request to Razorpay
    // 1. Create the request body
    const contactsRequestBody: ContactsRequest = {
        name: workerId,
        contact: workerRecord.phone_number!,
        type: "worker"
    }
    // 2. Make the post request
    // TODO @enhancement: Maybe rertry the request few times before marking the record as failed
    const response = await razorPayAxios.post<ContactsResponse>(RAZORPAY_CONTACTS_RELATIVE_URL, contactsRequestBody)
    // 3. Update the worker record with the obtained contactsId
    BasicModel.updateSingle('worker', { id: workerId }, { 
        payments_meta: {
            contacts_id: response.data.id
        }
     })
     // 4. Return the contactsId
    return response.data.id
}

/**
 * Request fundsId from Razorpay and save it in accounts table
 * @param accountRecord 
 * @param contactsId 
 */
const createAndSaveFundsId = async (accountRecord: PaymentsAccountRecord, contactsId: string) => {
    let fundAccountRequestBody: FundAccountRequest
    // 1. Determine the account type and create appropriate request body
    if (accountRecord.account_type === 'bank_account') { 
        fundAccountRequestBody = {
            account_type: 'bank_account',
            contacts_id: contactsId,
            bank_account: {
                name: (accountRecord.meta as any).name,
                account_number: (accountRecord.meta as any).account_details.id,
                ifsc: (accountRecord.meta as any).account_details.ifsc
            }
        }
    } else {
        fundAccountRequestBody = {
            account_type: 'vpa',
            contacts_id: contactsId,
            vpa: {
                address: (accountRecord.meta as any).account_details.id
            }
        }
    }

    // 2. Make the request to Razorpay
    let response: AxiosResponse<FundAccountResponse>
    try {
        response = await razorPayAxios.post<FundAccountResponse>(RAZORPAY_FUND_ACCOUNT_RELATIVE_URL, fundAccountRequestBody)
    } catch (e: any) {
        throw new Error(e.response.data.error.description)
    }
    
    // 3. Update the account record with the obtained fund id
    const updatedRecord = BasicModel.updateSingle('payments_account', 
    { id: accountRecord.id }, 
    {
        ...accountRecord, 
        fund_id: response.data.id,
        meta: {}
    })
    // 4. Return the fund account id
    return response.data.id
} 