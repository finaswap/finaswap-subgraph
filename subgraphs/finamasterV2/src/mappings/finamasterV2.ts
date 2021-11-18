import {
  Deposit,
  Withdraw,
  EmergencyWithdraw,
  Harvest,
  LogPoolAddition,
  LogSetPool,
  LogUpdatePool
} from '../../generated/FinaMasterV2/FinaMasterV2'

import { Address, BigDecimal, BigInt, dataSource, ethereum, log } from '@graphprotocol/graph-ts'
import {
  BIG_DECIMAL_1E12,
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_ZERO,
  BIG_INT_ONE,
  BIG_INT_ONE_DAY_SECONDS,
  BIG_INT_ZERO,
  FINA_MASTER_V2_ADDRESS,
  ACC_FNA_PRECISION
} from 'const'
import { FinaMaster, Pool, User, Rewarder } from '../../generated/schema'

import {
  getFinaMaster,
  getPool,
  getRewarder,
  getUser,
  updateRewarder
} from '../entities'

import { ERC20 as ERC20Contract } from '../../generated/FinaMasterV2/ERC20'

export function logPoolAddition(event: LogPoolAddition): void {
  log.info('[FinaMasterV2] Log Pool Addition {} {} {} {}', [
    event.params.pid.toString(),
    event.params.allocPoint.toString(),
    event.params.lpToken.toHex(),
    event.params.rewarder.toHex()
  ])

  const finaMaster = getFinaMaster(event.block)
  const pool = getPool(event.params.pid, event.block)
  const rewarder = getRewarder(event.params.rewarder, event.block)

  pool.pair = event.params.lpToken
  pool.rewarder = rewarder.id
  pool.allocPoint = event.params.allocPoint
  pool.save()

  finaMaster.totalAllocPoint = finaMaster.totalAllocPoint.plus(pool.allocPoint)
  finaMaster.poolCount = finaMaster.poolCount.plus(BIG_INT_ONE)
  finaMaster.save()
}

export function logSetPool(event: LogSetPool): void {
  log.info('[FinaMasterV2] Log Set Pool {} {} {} {}', [
    event.params.pid.toString(),
    event.params.allocPoint.toString(),
    event.params.rewarder.toHex(),
    event.params.overwrite == true ? 'true' : 'false'
  ])

  const finaMaster = getFinaMaster(event.block)
  const pool = getPool(event.params.pid, event.block)

  if (event.params.overwrite == true) {
     const rewarder = getRewarder(event.params.rewarder, event.block)
     pool.rewarder = rewarder.id
  }

  finaMaster.totalAllocPoint = finaMaster.totalAllocPoint.plus(event.params.allocPoint.minus(pool.allocPoint))
  finaMaster.save()

  pool.allocPoint = event.params.allocPoint
  pool.save()
}

export function logUpdatePool(event: LogUpdatePool): void {
  log.info('[FinaMasterV2] Log Update Pool {} {} {} {}', [
    event.params.pid.toString(),
    event.params.lastRewardBlock.toString(),
    event.params.lpSupply.toString(),
    event.params.accFinaPerShare.toString()
  ])

  const finaMaster = getFinaMaster(event.block)
  const pool = getPool(event.params.pid, event.block)
  updateRewarder(Address.fromString(pool.rewarder))

  pool.accFinaPerShare = event.params.accFinaPerShare
  pool.lastRewardBlock = event.params.lastRewardBlock
  pool.save()
}

export function deposit(event: Deposit): void {
  log.info('[FinaMasterV2] Log Deposit {} {} {} {}', [
    event.params.user.toHex(),
    event.params.pid.toString(),
    event.params.amount.toString(),
    event.params.to.toHex()
  ])

  const finaMaster = getFinaMaster(event.block)
  const pool = getPool(event.params.pid, event.block)
  const user = getUser(event.params.to, event.params.pid, event.block)

  pool.slpBalance = pool.slpBalance.plus(event.params.amount)
  pool.save()

  user.amount = user.amount.plus(event.params.amount)
  user.rewardDebt = user.rewardDebt.plus(event.params.amount.times(pool.accFinaPerShare).div(ACC_FNA_PRECISION))
  user.save()
}

export function withdraw(event: Withdraw): void {
  log.info('[FinaMasterV2] Log Withdraw {} {} {} {}', [
    event.params.user.toHex(),
    event.params.pid.toString(),
    event.params.amount.toString(),
    event.params.to.toHex()
  ])

  const finaMaster = getFinaMaster(event.block)
  const pool = getPool(event.params.pid, event.block)
  const user = getUser(event.params.user, event.params.pid, event.block)

  pool.slpBalance = pool.slpBalance.minus(event.params.amount)
  pool.save()

  user.amount = user.amount.minus(event.params.amount)
  user.rewardDebt = user.rewardDebt.minus(event.params.amount.times(pool.accFinaPerShare).div(ACC_FNA_PRECISION))
  user.save()
}

export function emergencyWithdraw(event: EmergencyWithdraw): void {
  log.info('[FinaMasterV2] Log Emergency Withdraw {} {} {} {}', [
    event.params.user.toHex(),
    event.params.pid.toString(),
    event.params.amount.toString(),
    event.params.to.toHex()
  ])

  const finaMasterV2 = getFinaMaster(event.block)
  const user = getUser(event.params.user, event.params.pid, event.block)

  user.amount = BIG_INT_ZERO
  user.rewardDebt = BIG_INT_ZERO
  user.save()
}

export function harvest(event: Harvest): void {
  log.info('[FinaMasterV2] Log Withdraw {} {} {}', [
    event.params.user.toHex(),
    event.params.pid.toString(),
    event.params.amount.toString()
  ])

  const finaMaster = getFinaMaster(event.block)
  const pool = getPool(event.params.pid, event.block)
  const user = getUser(event.params.user, event.params.pid, event.block)

  let accumulatedFina = user.amount.times(pool.accFinaPerShare).div(ACC_FNA_PRECISION)

  user.rewardDebt = accumulatedFina
  user.finaHarvested = user.finaHarvested.plus(event.params.amount)
  user.save()
}
