import { config } from 'dotenv'
import path from 'path'
// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') })
import {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    ListTablesCommand,
    type CreateTableCommandInput,
} from '@aws-sdk/client-dynamodb'
import {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand,
    ScanCommand,
    QueryCommand,
} from '@aws-sdk/lib-dynamodb'

// ─── Custom Error Classes ─────────────────────────────────────────────────────

export class DynamoDBError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown,
        public readonly operation?: string,
        public readonly tableName?: string
    ) {
        super(message)
        this.name = 'DynamoDBError'
    }
}

export class DynamoDBConnectionError extends DynamoDBError {
    constructor(cause?: unknown) {
        super('Failed to connect to DynamoDB', cause, 'connection')
        this.name = 'DynamoDBConnectionError'
    }
}

export class DynamoDBTableNotFoundError extends DynamoDBError {
    constructor(tableName: string, cause?: unknown) {
        super(`Table "${tableName}" does not exist`, cause, 'describe', tableName)
        this.name = 'DynamoDBTableNotFoundError'
    }
}

export class DynamoDBItemNotFoundError extends DynamoDBError {
    constructor(tableName: string, key: Record<string, unknown>) {
        super(`Item not found in "${tableName}" with key ${JSON.stringify(key)}`, undefined, 'get', tableName)
        this.name = 'DynamoDBItemNotFoundError'
    }
}

export class DynamoDBValidationError extends DynamoDBError {
    constructor(message: string, tableName?: string) {
        super(message, undefined, 'validation', tableName)
        this.name = 'DynamoDBValidationError'
    }
}

export class DynamoDBRetryExhaustedError extends DynamoDBError {
    constructor(operation: string, attempts: number, cause?: unknown) {
        super(`DynamoDB operation "${operation}" failed after ${attempts} attempts`, cause, operation)
        this.name = 'DynamoDBRetryExhaustedError'
    }
}

export class DynamoDBTableCreationTimeoutError extends DynamoDBError {
    constructor(tableName: string) {
        super(`Timed out waiting for table "${tableName}" to become ACTIVE`, undefined, 'createTable', tableName)
        this.name = 'DynamoDBTableCreationTimeoutError'
    }
}

export class DynamoDBConfigError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'DynamoDBConfigError'
    }
}

// ─── Config Validation ────────────────────────────────────────────────────────

function validateConfig(): void {
    const missing: string[] = []
    if (!process.env.AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID')
    if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY')

    if (missing.length > 0) {
        throw new DynamoDBConfigError(
            `Missing required environment variables: ${missing.join(', ')}. ` +
            `Ensure your .env file is configured correctly.`
        )
    }
}

validateConfig()

// ─── Client Setup ─────────────────────────────────────────────────────────────

const dynamoDBConfig = {
    region: process.env.AWS_REGION || 'eu-north-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
}

const client = new DynamoDBClient(dynamoDBConfig)
export const dynamoDb = DynamoDBDocumentClient.from(client)

// ─── Table Names ──────────────────────────────────────────────────────────────

export const TABLES = {
    USERS: process.env.DYNAMODB_USERS_TABLE || 'realevr-users',
    PROPERTIES: process.env.DYNAMODB_PROPERTIES_TABLE || 'realevr-properties',
    AMENITIES: process.env.DYNAMODB_AMENITIES_TABLE || 'realevr-amenities',
    PROPERTY_TYPES: process.env.DYNAMODB_PROPERTY_TYPES_TABLE || 'realevr-property-types',
    USER_TOURS: process.env.DYNAMODB_USER_TOURS_TABLE || 'realevr-user-tours',
    PROPERTY_VIEWS: process.env.DYNAMODB_PROPERTY_VIEWS_TABLE || 'realevr-property-views',
    TOUR_PAYMENTS: process.env.DYNAMODB_TOUR_PAYMENTS_TABLE || 'realevr-tour-payments',
    SETTINGS: process.env.DYNAMODB_SETTINGS_TABLE || 'realevr-settings',
    NOTIFICATIONS: process.env.DYNAMODB_NOTIFICATIONS_TABLE || 'realevr-notifications',
    REVIEWS: process.env.DYNAMODB_REVIEWS_TABLE || 'realevr-reviews',
} as const

// ─── Retry Logic ──────────────────────────────────────────────────────────────

const MAX_RETRIES = 5
const INITIAL_RETRY_DELAY = 1000
const BACKOFF_FACTOR = 1.5

const RETRYABLE_ERROR_NAMES = new Set([
    'ProvisionedThroughputExceededException',
    'ThrottlingException',
    'ServiceUnavailableException',
    'InternalServerError',
    'RequestLimitExceeded',
])

const RETRYABLE_ERROR_CODES = new Set([
    'NetworkingError',
    'TimeoutError',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
])

function isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
        const name = (error as NodeJS.ErrnoException).name ?? ''
        const code = (error as NodeJS.ErrnoException).code ?? ''
        return RETRYABLE_ERROR_NAMES.has(name) || RETRYABLE_ERROR_CODES.has(code)
    }
    return false
}

export async function executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName = 'unknown'
): Promise<T> {
    let lastError: unknown
    let delay = INITIAL_RETRY_DELAY

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await operation()
        } catch (error) {
            lastError = error

            if (!isRetryable(error) || attempt === MAX_RETRIES) {
                // Wrap unknown errors in a DynamoDBError for consistent handling upstream
                if (error instanceof DynamoDBError) throw error
                throw new DynamoDBError(
                    `DynamoDB operation "${operationName}" failed: ${error instanceof Error ? error.message : String(error)}`,
                    error,
                    operationName
                )
            }

            console.warn(
                `[DynamoDB] Operation "${operationName}" failed on attempt ${attempt}/${MAX_RETRIES}. ` +
                `Retrying in ${delay}ms...`,
                { errorName: (error as Error).name }
            )
            await new Promise((resolve) => setTimeout(resolve, delay))
            delay = Math.floor(delay * BACKOFF_FACTOR)
        }
    }

    throw new DynamoDBRetryExhaustedError(operationName, MAX_RETRIES, lastError)
}

// ─── ID / Timestamp Helpers ───────────────────────────────────────────────────

export function generateId(): number {
    return Date.now()
}

export function toStringId(id: number): string {
    // if (!Number.isFinite(id) || id <= 0) {
    //     throw new DynamoDBValidationError(`Invalid ID value: ${id}`)
    // }
    return id.toString()
}

export function toNumericId(id: string): number {
    const parsed = parseInt(id, 10)
    // if (isNaN(parsed) || parsed <= 0) {
    //     console.log("Fake-Property",id)
    //     throw new DynamoDBValidationError(`Cannot convert "${id}" to a valid numeric ID`)
    // }
    return parsed
}

export function generateTimestamp(): string {
    return new Date().toISOString()
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkDynamoDBHealth(): Promise<boolean> {
    try {
        await dynamoDb.send(new ScanCommand({ TableName: TABLES.USERS, Limit: 1 }))
        console.log('[DynamoDB] Health check: connection is healthy.')
        return true
    } catch (error) {
        console.error('[DynamoDB] Health check failed:', error instanceof Error ? error.message : error)
        return false
    }
}

// ─── DynamoDB Utils ───────────────────────────────────────────────────────────

export const DynamoDBUtils = {
    async putItem(tableName: string, item: Record<string, unknown>) {
        if (!tableName) throw new DynamoDBValidationError('tableName is required for putItem')
        if (!item || typeof item !== 'object') throw new DynamoDBValidationError('item must be a non-null object', tableName)

        return executeWithRetry(
            () => dynamoDb.send(new PutCommand({ TableName: tableName, Item: item })),
            `putItem:${tableName}`
        )
    },

    async getItem(tableName: string, key: Record<string, unknown>) {
        if (!tableName) throw new DynamoDBValidationError('tableName is required for getItem')
        if (!key || !Object.keys(key).length) throw new DynamoDBValidationError('key must be a non-empty object', tableName)

        const result = await executeWithRetry(
            () => dynamoDb.send(new GetCommand({ TableName: tableName, Key: key })),
            `getItem:${tableName}`
        )

        return result.Item ?? null  // explicit null instead of undefined
    },

    async getItemOrThrow(tableName: string, key: Record<string, unknown>) {
        const item = await this.getItem(tableName, key)
        if (item === null) throw new DynamoDBItemNotFoundError(tableName, key)
        return item
    },

    async updateItem(
        tableName: string,
        key: Record<string, unknown>,
        updateExpression: string,
        expressionAttributeValues: Record<string, unknown>,
        expressionAttributeNames?: Record<string, string>
    ) {
        if (!tableName) throw new DynamoDBValidationError('tableName is required for updateItem')
        if (!updateExpression?.trim()) throw new DynamoDBValidationError('updateExpression cannot be empty', tableName)
        if (!expressionAttributeValues || !Object.keys(expressionAttributeValues).length) {
            throw new DynamoDBValidationError('expressionAttributeValues cannot be empty', tableName)
        }

        const result = await executeWithRetry(
            () => dynamoDb.send(new UpdateCommand({
                TableName: tableName,
                Key: key,
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames,
                ReturnValues: 'ALL_NEW',
            })),
            `updateItem:${tableName}`
        )

        return result.Attributes ?? null
    },

    async deleteItem(tableName: string, key: Record<string, unknown>) {
        if (!tableName) throw new DynamoDBValidationError('tableName is required for deleteItem')
        if (!key || !Object.keys(key).length) throw new DynamoDBValidationError('key must be a non-empty object', tableName)

        const result = await executeWithRetry(
            () => dynamoDb.send(new DeleteCommand({
                TableName: tableName,
                Key: key,
                ReturnValues: 'ALL_OLD',
            })),
            `deleteItem:${tableName}`
        )

        return result.Attributes ?? null
    },

    async scanTable(
        tableName: string,
        filterExpression?: string,
        expressionAttributeValues?: Record<string, unknown>,
        expressionAttributeNames?: Record<string, string>
    ) {
        if (!tableName) throw new DynamoDBValidationError('tableName is required for scanTable')

        const result = await executeWithRetry(
            () => dynamoDb.send(new ScanCommand({
                TableName: tableName,
                FilterExpression: filterExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames,
            })),
            `scanTable:${tableName}`
        )

        return result.Items ?? []
    },

    async queryTable(
        tableName: string,
        keyConditionExpression: string,
        expressionAttributeValues: Record<string, unknown>,
        expressionAttributeNames?: Record<string, string>,
        indexName?: string
    ) {
        if (!tableName) throw new DynamoDBValidationError('tableName is required for queryTable')
        if (!keyConditionExpression?.trim()) throw new DynamoDBValidationError('keyConditionExpression cannot be empty', tableName)
        if (!expressionAttributeValues || !Object.keys(expressionAttributeValues).length) {
            throw new DynamoDBValidationError('expressionAttributeValues cannot be empty for query', tableName)
        }

        const result = await executeWithRetry(
            () => dynamoDb.send(new QueryCommand({
                TableName: tableName,
                KeyConditionExpression: keyConditionExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames: expressionAttributeNames,
                IndexName: indexName,
            })),
            `queryTable:${tableName}`
        )

        return result.Items ?? []
    },

    // Alias for backward compatibility
    query(
        tableName: string,
        keyConditionExpression: string,
        expressionAttributeValues: Record<string, unknown>,
        expressionAttributeNames?: Record<string, string>,
        indexName?: string
    ) {
        return this.queryTable(tableName, keyConditionExpression, expressionAttributeValues, expressionAttributeNames, indexName)
    },
}

// ─── Table Management ─────────────────────────────────────────────────────────

const TABLE_CREATION_TIMEOUT_ATTEMPTS = 30
const TABLE_POLL_INTERVAL_MS = 2000

export async function createTablesIfNotExist(): Promise<void> {
    console.log('🔧 Checking and creating DynamoDB tables...')

    const tableDefinitions: CreateTableCommandInput[] = [
        {
            TableName: TABLES.USERS,
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
        },
        {
            TableName: TABLES.PROPERTIES,
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
        },
        {
            TableName: TABLES.AMENITIES,
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
        },
        {
            TableName: TABLES.PROPERTY_TYPES,
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
        },
        {
            TableName: TABLES.USER_TOURS,
            KeySchema: [
                { AttributeName: 'userId', KeyType: 'HASH' },
                { AttributeName: 'tourId', KeyType: 'RANGE' },
            ],
            AttributeDefinitions: [
                { AttributeName: 'userId', AttributeType: 'S' },
                { AttributeName: 'tourId', AttributeType: 'S' },
            ],
            BillingMode: 'PAY_PER_REQUEST',
        },
        {
            TableName: TABLES.PROPERTY_VIEWS,
            KeySchema: [
                { AttributeName: 'propertyId', KeyType: 'HASH' },
                { AttributeName: 'viewId', KeyType: 'RANGE' },
            ],
            AttributeDefinitions: [
                { AttributeName: 'propertyId', AttributeType: 'S' },
                { AttributeName: 'viewId', AttributeType: 'S' },
            ],
            BillingMode: 'PAY_PER_REQUEST',
        },
        {
            TableName: TABLES.TOUR_PAYMENTS,
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
        },
        {
            TableName: TABLES.SETTINGS,
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
        },
        {
            TableName: TABLES.NOTIFICATIONS,
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
        },
        {
            TableName: TABLES.REVIEWS,
            KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
            AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
            BillingMode: 'PAY_PER_REQUEST',
        },
    ]

    for (const tableDefinition of tableDefinitions) {
        const tableName = tableDefinition.TableName!
        try {
            await client.send(new DescribeTableCommand({ TableName: tableName }))
            console.log(`  ✓ Table "${tableName}" already exists.`)
        } catch (error: unknown) {
            if (!(error instanceof Error) || (error as { name?: string }).name !== 'ResourceNotFoundException') {
                throw new DynamoDBError(`Unexpected error while checking table "${tableName}"`, error, 'describeTable', tableName)
            }

            console.log(`  + Table "${tableName}" not found — creating...`)
            try {
                await client.send(new CreateTableCommand(tableDefinition))
            } catch (createError: unknown) {
                throw new DynamoDBError(`Failed to create table "${tableName}"`, createError, 'createTable', tableName)
            }

            // Poll until ACTIVE
            for (let attempt = 1; attempt <= TABLE_CREATION_TIMEOUT_ATTEMPTS; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, TABLE_POLL_INTERVAL_MS))
                try {
                    const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName }))
                    const status = Table?.TableStatus
                    console.log(`    └─ "${tableName}" status: ${status} (attempt ${attempt}/${TABLE_CREATION_TIMEOUT_ATTEMPTS})`)
                    if (status === 'ACTIVE') break
                    if (attempt === TABLE_CREATION_TIMEOUT_ATTEMPTS) {
                        throw new DynamoDBTableCreationTimeoutError(tableName)
                    }
                } catch (pollError) {
                    if (pollError instanceof DynamoDBTableCreationTimeoutError) throw pollError
                    throw new DynamoDBError(`Error polling status of table "${tableName}"`, pollError, 'pollTable', tableName)
                }
            }

            console.log(`  ✅ Table "${tableName}" is ACTIVE.`)
        }
    }

    console.log('🎉 All tables are ready!')
}

export async function listTables(): Promise<string[]> {
    try {
        const result = await client.send(new ListTablesCommand({}))
        return result.TableNames ?? []
    } catch (error) {
        throw new DynamoDBError('Failed to list DynamoDB tables', error, 'listTables')
    }
}

// ─── Periodic Health Check ────────────────────────────────────────────────────

const HEALTH_CHECK_INTERVAL = 10 * 60 * 1000

setInterval(async () => {
    try {
        await checkDynamoDBHealth()
    } catch (error) {
        console.error('[DynamoDB] Scheduled health check threw unexpectedly:', error instanceof Error ? error.message : error)
    }
}, HEALTH_CHECK_INTERVAL)