import { Pool } from '../../generated/schema'
import { BigInt, Address, dataSource, ethereum } from '@graphprotocol/graph-ts'
import { BIG_INT_ZERO, ADDRESS_ZERO } from 'const'
import { getFinaMaster } from './finamaster'

export function getPool(pid: BigInt, block: ethereum.Block): Pool {
  const finaMaster = getFinaMaster(block)

  let pool = Pool.load(pid.toString())

  if (pool === null) {
    pool = new Pool(pid.toString())
    pool.finaMaster = finaMaster.id
    pool.pair = ADDRESS_ZERO
    pool.allocPoint = BIG_INT_ZERO
    pool.lastRewardBlock = BIG_INT_ZERO
    pool.accFinaPerShare = BIG_INT_ZERO
    pool.slpBalance = BIG_INT_ZERO
    pool.userCount = BIG_INT_ZERO
  }

  pool.timestamp = block.timestamp
  pool.block = block.number
  pool.save()

  return pool as Pool
}
