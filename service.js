const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = 9080;

// PostgreSQL connection pool
const pool = new Pool({
  host: '84.32.32.160',
  port: 5432,
  database: 'tl-validators',
  user: 'abhishek',
  password: 'dkdocs161993',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'API is running',
    endpoints: [
      'POST /validator-stake-tier-distribution',
      'POST /validator-staker-metrics',
      'POST /validators/validator_staker_metrics_range',
      'POST /validator-lorenz-curve'
    ]
  });
});

// Endpoint 1: ValidatorStakeTierDistribution
app.post('/validator-stake-tier-distribution', async (req, res) => {
  try {
    const { parameters } = req.body;
    const vote_account = parameters?.vote_account;

    if (!vote_account) {
      return res.status(400).json({
        success: false,
        error: 'vote_account parameter is required'
      });
    }

    const query = 'SELECT * FROM tl_solana.validator_stake_tier_distribution WHERE vote_account = $1 ORDER BY epoch DESC';
    const result = await pool.query(query, [vote_account]);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching validator stake tier distribution:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint 2: ValidatorStakerMetrics
app.post('/validator-staker-metrics', async (req, res) => {
  try {
    // Support both formats: { vote_account } or { parameters: { vote_account } }
    const vote_account = req.body.vote_account || req.body.parameters?.vote_account;

    if (!vote_account) {
      return res.status(400).json({
        success: false,
        error: 'vote_account parameter is required'
      });
    }

    const query = `
      SELECT 
        epoch,
        vote_account,
        calculation_timestamp,
        total_stakers,
        total_stake,
        mean_stake,
        median_stake,
        mean_median_ratio,
        std_dev,
        coefficient_of_variation,
        iqr,
        p5,
        p10,
        p25,
        p50,
        p75,
        p90,
        p95,
        p99,
        gini_coefficient,
        nakamoto_coeff_33,
        nakamoto_coeff_51,
        hhi_index,
        top_01pct_concentration,
        top_1pct_concentration,
        top_5pct_concentration,
        top_10pct_concentration,
        skewness,
        kurtosis,
        network_total_stakers,
        network_total_stake,
        network_mean_stake,
        network_median_stake,
        network_stddev_stake,
        network_q1_stake,
        network_q3_stake,
        network_gini_coefficient,
        network_hhi_index,
        network_nakamoto_coeff_33,
        network_nakamoto_coeff_51,
        gini_percentile_rank,
        stakers_z_score,
        total_rewards_distributed as staking_reward,
        avg_reward_per_staker,
        median_reward_per_staker,
        reward_gini_coefficient,
        reward_stake_gini_diff,
        avg_reward_rate_pct,
        median_reward_rate_pct,
        min_reward_rate_pct,
        max_reward_rate_pct,
        total_commission_collected,
        validator_commission_pct,
        block_rewards_sol
      FROM tl_solana.validator_staker_metrics 
      WHERE vote_account = $1 
      ORDER BY epoch DESC
    `;
    const result = await pool.query(query, [vote_account]);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching validator staker metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

  // Endpoint 2.1: ValidatorStakerMetrics Range
  app.post('/validators/validator_staker_metrics_range', async (req, res) => {
  try {
    console.log('Received request for validator_staker_metrics_range:', req.body);

    const { parameters } = req.body;

    if (!parameters) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'Request body must include "parameters" object'
      });
    }

    const { vote_account, start_epoch, end_epoch } = parameters;

    if (!vote_account || start_epoch === undefined || end_epoch === undefined) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: '"vote_account", "start_epoch", and "end_epoch" are required'
      });
    }

    const startEpochNum = Number(start_epoch);
    const endEpochNum = Number(end_epoch);

    if (!Number.isFinite(startEpochNum) && start_epoch !== 'auto') {
      return res.status(400).json({
        error: 'Invalid parameter type',
        message: '"start_epoch" must be numeric or "auto"'
      });
    }

    if (!Number.isFinite(endEpochNum) && end_epoch !== 'auto') {
      return res.status(400).json({
        error: 'Invalid parameter type',
        message: '"end_epoch" must be numeric or "auto"'
      });
    }

    if (Number.isFinite(startEpochNum) && Number.isFinite(endEpochNum) && startEpochNum > endEpochNum) {
      return res.status(400).json({
        error: 'Invalid parameter values',
        message: '"start_epoch" must be less than or equal to "end_epoch"'
      });
    }

    console.log('Querying for vote_account with epoch range:', {
      vote_account,
      start_epoch: start_epoch,
      end_epoch: end_epoch
    });

    const query = `
      SELECT 
        epoch,
        vote_account,
        total_stakers,
        total_stake,
        mean_stake,
        median_stake,
        mean_median_ratio,
        total_rewards_distributed AS staking_reward,
        avg_reward_per_staker,
        median_reward_per_staker,
        total_commission_collected,
        validator_commission_pct,
        block_rewards_sol
      FROM tl_solana.validator_staker_metrics v
      WHERE
        -- start_epoch:
        --   'auto' -> use 804
        --   otherwise -> use the numeric value of $2
        v.epoch >= CASE
          WHEN LOWER($2::text) = 'auto' THEN 804
          ELSE $2::bigint
        END

        -- end_epoch:
        --   'auto' -> use MAX(epoch)
        --   otherwise -> use the numeric value of $3
        AND v.epoch <= CASE
          WHEN LOWER($3::text) = 'auto' THEN (
            SELECT MAX(epoch) FROM tl_solana.validator_staker_metrics
          )
          ELSE $3::bigint
        END

        -- vote_account:
        --   '' or 'all' -> no filter (all validators)
        AND (
          $1 = ''
          OR LOWER($1) = 'all'
          OR v.vote_account = $1
        )
      ORDER BY v.epoch DESC
    `;

    const result = await pool.query(query, [vote_account, start_epoch, end_epoch]);

    console.log('Query result rows for range:', result.rows.length);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'No data found for the given vote_account and epoch range',
        parameters: { vote_account, start_epoch, end_epoch }
      });
    }

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Database error in validator_staker_metrics_range:', error);
    console.error('Error stack:', error.stack);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        detail: error.detail || 'No additional details available'
      });
    }
  }
});

// Endpoint 3: ValidatorLorenzCurve
app.post('/validator-lorenz-curve', async (req, res) => {
  try {
    // Support both formats: { epoch, vote_account } or { parameters: { epoch, vote_account } }
    const epoch = req.body.epoch || req.body.parameters?.epoch;
    const vote_account = req.body.vote_account || req.body.parameters?.vote_account;

    if (!epoch || !vote_account) {
      return res.status(400).json({
        success: false,
        error: 'Both epoch and vote_account parameters are required'
      });
    }

    const query = 'SELECT * FROM tl_solana.validator_lorenz_curve WHERE epoch = $1 AND vote_account = $2 ORDER BY cumulative_pct_stakers';
    const result = await pool.query(query, [epoch, vote_account]);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching validator lorenz curve:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`API Server running on http://0.0.0.0:${port}`);
  console.log(`Server is accessible at: http://84.32.32.160:${port}`);
  console.log('Available endpoints:');
    console.log(`  - POST http://localhost:${port}/validator-stake-tier-distribution`);
    console.log(`  - POST http://localhost:${port}/validator-staker-metrics`);
    console.log(`  - POST http://localhost:${port}/validators/validator_staker_metrics_range`);
    console.log(`  - POST http://localhost:${port}/validator-lorenz-curve`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  pool.end(() => {
    console.log('Database pool closed');
  });
});

