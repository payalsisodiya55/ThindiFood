import { getOrderQueue } from '../index.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

let orderQueueUnavailableLogged = false;

/**
 * Add an order processing job to the queue. No-op if BullMQ is disabled.
 * @param {object} data - Job data (e.g. { orderId, action })
 * @param {object} [options] - BullMQ job options override
 * @returns {Promise<import('bullmq').Job | null>}
 */
export const addOrderJob = async (data, options = {}) => {
    const queue = getOrderQueue();
    if (!queue) {
        if (!config.bullmqEnabled || !config.redisEnabled) {
            if (!orderQueueUnavailableLogged) {
                orderQueueUnavailableLogged = true;
                logger.info('BullMQ order queue is disabled by configuration. Order jobs will run inline only.');
            }
        } else {
            logger.warn('BullMQ order queue not available. Job not added.');
        }
        return null;
    }
    try {
        const job = await queue.add('process-order', data, options);
        logger.info(`Order job added: ${job.id}`);
        return job;
    } catch (err) {
        logger.error(`Failed to add order job: ${err.message}`);
        throw err;
    }
};
