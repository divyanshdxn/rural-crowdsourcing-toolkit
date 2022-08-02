import { BasicModel, karyaLogger, Logger, QueueWrapper } from '@karya/common';
import { BulkTransactionTaskStatus } from '@karya/core';
import { Job, Queue } from 'bullmq';
import { bulkTransactionQConsumer } from './consumer/bulkTransactionQConsumer';
import { Qconfig, BulkTransactionQJobData, BulkTransactionQPayload, BulkTransactionQResult } from './Types';

const QLogger: Logger = karyaLogger({
  name: 'BulkTransactionQBackend',
  logToConsole: true,
  consoleLogLevel: 'info',
});

export class BulkTransactionQWrapper extends QueueWrapper<Queue> {
  constructor(config: Qconfig) {
    super(config);
  }

  intialiseQueue(): void {
    console.log(this.config, this.config.opts);
    this.queue = new Queue<BulkTransactionQJobData>(this.config.qname, this.config.opts);
  }

  onStart(): void {
    // TODO: Write OnStart Script
  }

  async enqueue(jobName: string, payload: BulkTransactionQPayload, ...args: any[]): Promise<BulkTransactionQResult> {
    let createdBulkTransactionRecord = await BasicModel.insertRecord('bulk_payments_transaction', {
      user_id: payload.userId,
      amount: payload.amount.toString(),
      n_workers: payload.n_workers.toString(),
      status: BulkTransactionTaskStatus.INITIALISED,
    });

    // TODO: Make a single object Job with payload and jobname
    let addedJob = await this.queue.add(jobName, {
      bulkTransactionRecord: createdBulkTransactionRecord,
      bulkTransactionRequest: payload.bulkTransactionRequest,
    });

    return { jobId: addedJob.id!, createdBulkTransactionRecord };
  }
  close() {
    return this.queue.close();
  }
}

// Defining success and failure cases for the consumer working on Queue
bulkTransactionQConsumer.on('completed', (job) => {
  QLogger.info(`Completed job ${job.id} successfully`);
});

// Handling errors
bulkTransactionQConsumer.on('failed', async (job: Job<BulkTransactionQJobData>, error) => {
  QLogger.error(
    `Failed job ${job.id} with error: ${error.message} and record id: ${job.data.bulkTransactionRecord.id}`
  );
  const bulkTransactionRecord = job.data.bulkTransactionRecord;
  const meta = bulkTransactionRecord.meta;
  // Update the status and save the error in the database
  const updatedBulkTransactionRecord = await BasicModel.updateSingle(
    'bulk_payments_transaction',
    { id: bulkTransactionRecord.id },
    {
      status: BulkTransactionTaskStatus.FAILED,
      meta: {
        ...meta,
        failure_server: 'server',
        failure_source: 'Bulk Transaction Queue Processor',
        failure_reason: error.message,
      },
    }
  );
});
