import { Address, BigInt, ethereum, log } from '@graphprotocol/graph-ts'
import {
  BIG_DECIMAL_1E12,
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_ZERO,
  BIG_INT_ONE,
  BIG_INT_ZERO,
  LOCKUP_BLOCK_NUMBER,
  LOCKUP_POOL_NUMBER,
  FINA_MASTER_ADDRESS,
} from 'const'
import {
  Deposit,
  FinaMaster as FinaMasterContract,
  FinaMaster__poolInfoResult,
  SetCall,
  Withdraw,
} from '../generated/FinaMaster/FinaMaster'
import { Lockup, Pool, User } from '../generated/schema'
import { getFinaPrice } from 'pricing'
import { Pair as PairContract } from '../generated/FinaMaster/Pair'

export function getUser(pid: BigInt, address: Address, block: ethereum.Block): User {
  const uid = address.toHex()
  const id = pid.toString().concat('-').concat(uid)

  let user = User.load(id)

  if (user === null) {
    user = new User(id)
    user.lockup = '0'
    user.pool = pid.toString()
    user.address = address
    user.amount = BIG_INT_ZERO
    user.rewardDebt = BIG_INT_ZERO
    user.finaHarvestedSinceLockup = BIG_DECIMAL_ZERO
    user.finaHarvestedSinceLockupUSD = BIG_DECIMAL_ZERO
    user.save()
  }

  return user as User
}

export function getPool(id: BigInt): Pool {
  let pool = Pool.load(id.toString())

  if (pool === null) {
    const finaMasterContract = FinaMasterContract.bind(FINA_MASTER_ADDRESS)

    // Create new pool.
    pool = new Pool(id.toString())
    const poolInfo = finaMasterContract.poolInfo(id)
    pool.allocPoint = poolInfo.value1
    pool.accFinaPerShare = poolInfo.value3

    pool.save()
  }

  return pool as Pool
}

// Calls
export function set(call: SetCall): void {
  if (call.inputs._pid == LOCKUP_POOL_NUMBER) {
    log.info('Alright stop, lockup time...', [])

    const finaMasterContract = FinaMasterContract.bind(FINA_MASTER_ADDRESS)
    const poolLength = finaMasterContract.poolLength()

    const lockup = new Lockup('0')
    lockup.poolLength = poolLength
    lockup.totalAllocPoint = finaMasterContract.totalAllocPoint()
    lockup.save()

    log.info('Saved lockup entity, before loop. Pool length: {}', [poolLength.toString()])

    for (let i = BIG_INT_ZERO, j = poolLength; i < j; i = i.plus(BIG_INT_ONE)) {
      log.warning('Setting pool state at lockup for pid {}', [i.toString()])

      let poolInfoResult: ethereum.CallResult<FinaMaster__poolInfoResult> = finaMasterContract.try_poolInfo(i)

      let poolInfo: FinaMaster__poolInfoResult = null

      if (!poolInfoResult.reverted) {
        poolInfo = poolInfoResult.value
      } else if (poolInfo === null) {
        continue
      }

      const pairContract = PairContract.bind(poolInfo.value0)
      const pool = new Pool(i.toString())
      pool.lockup = lockup.id
      pool.allocPoint = poolInfo.value1
      pool.accFinaPerShare = poolInfo.value3
      // pool.balance = pairContract.balanceOf(FINA_MASTER_ADDRESS)
      pool.save()
    }
  }
}

function transfer(pid: BigInt, userAddr: Address, block: ethereum.Block): void {
  const finaMasterContract = FinaMasterContract.bind(FINA_MASTER_ADDRESS)
  const user = getUser(pid, userAddr, block)

  const poolInfo = finaMasterContract.poolInfo(pid)
  const pool = getPool(pid)
  pool.accFinaPerShare = poolInfo.value3
  pool.save()

  if (block.number.ge(LOCKUP_BLOCK_NUMBER)) {
    const pool = getPool(pid)
    const pending = user.amount
      .toBigDecimal()
      .times(pool.accFinaPerShare.toBigDecimal())
      .div(BIG_DECIMAL_1E12)
      .minus(user.rewardDebt.toBigDecimal())
      .div(BIG_DECIMAL_1E18)
    if (pending.gt(BIG_DECIMAL_ZERO)) {
      user.finaHarvestedSinceLockup = user.finaHarvestedSinceLockup.plus(pending)
      const finaHarvestedUSD = pending.times(getFinaPrice(block))
      user.finaHarvestedSinceLockupUSD = user.finaHarvestedSinceLockupUSD.plus(finaHarvestedUSD)
    }
  }
  const userInfo = finaMasterContract.userInfo(pid, userAddr)
  user.amount = userInfo.value0
  user.rewardDebt = userInfo.value1
  user.save()
}

// Events
export function deposit(event: Deposit): void {
  transfer(event.params.pid, event.params.user, event.block)
}

export function withdraw(event: Withdraw): void {
  transfer(event.params.pid, event.params.user, event.block)
}
