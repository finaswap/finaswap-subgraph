import {
  ADDRESS_ZERO,
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_1E6,
  BIG_DECIMAL_ZERO,
  BIG_INT_ZERO,
  FINA_LOUNGE_ADDRESS,
  FNA_TOKEN_ADDRESS,
  FNA_USDT_PAIR_ADDRESS,
} from 'const'
import { Address, BigDecimal, BigInt, dataSource, ethereum, log } from '@graphprotocol/graph-ts'
import { Bar, History, User } from '../generated/schema'
import { Bar as BarContract, Transfer as TransferEvent } from '../generated/FinaLounge/Bar'

import { Pair as PairContract } from '../generated/FinaLounge/Pair'
import { FinaToken as FinaTokenContract } from '../generated/FinaLounge/FinaToken'

// TODO: Get averages of multiple fina stablecoin pairs
function getFinaPrice(): BigDecimal {
  const pair = PairContract.bind(FNA_USDT_PAIR_ADDRESS)
  const reserves = pair.getReserves()
  return reserves.value1.toBigDecimal().times(BIG_DECIMAL_1E18).div(reserves.value0.toBigDecimal()).div(BIG_DECIMAL_1E6)
}

function createBar(block: ethereum.Block): Bar {
  const contract = BarContract.bind(dataSource.address())
  const bar = new Bar(dataSource.address().toHex())
  bar.decimals = contract.decimals()
  bar.name = contract.name()
  bar.fina = contract.fina()
  bar.symbol = contract.symbol()
  bar.totalSupply = BIG_DECIMAL_ZERO
  bar.finaStaked = BIG_DECIMAL_ZERO
  bar.finaStakedUSD = BIG_DECIMAL_ZERO
  bar.finaHarvested = BIG_DECIMAL_ZERO
  bar.finaHarvestedUSD = BIG_DECIMAL_ZERO
  bar.xFNAMinted = BIG_DECIMAL_ZERO
  bar.xFNABurned = BIG_DECIMAL_ZERO
  bar.xFNAAge = BIG_DECIMAL_ZERO
  bar.xFNAAgeDestroyed = BIG_DECIMAL_ZERO
  bar.ratio = BIG_DECIMAL_ZERO
  bar.updatedAt = block.timestamp
  bar.save()

  return bar as Bar
}

function getBar(block: ethereum.Block): Bar {
  let bar = Bar.load(dataSource.address().toHex())

  if (bar === null) {
    bar = createBar(block)
  }

  return bar as Bar
}

function createUser(address: Address, block: ethereum.Block): User {
  const user = new User(address.toHex())

  // Set relation to bar
  user.bar = dataSource.address().toHex()

  user.xFNA = BIG_DECIMAL_ZERO
  user.xFNAMinted = BIG_DECIMAL_ZERO
  user.xFNABurned = BIG_DECIMAL_ZERO

  user.finaStaked = BIG_DECIMAL_ZERO
  user.finaStakedUSD = BIG_DECIMAL_ZERO

  user.finaHarvested = BIG_DECIMAL_ZERO
  user.finaHarvestedUSD = BIG_DECIMAL_ZERO

  // In/Out
  user.xFNAOut = BIG_DECIMAL_ZERO
  user.finaOut = BIG_DECIMAL_ZERO
  user.usdOut = BIG_DECIMAL_ZERO

  user.xFNAIn = BIG_DECIMAL_ZERO
  user.finaIn = BIG_DECIMAL_ZERO
  user.usdIn = BIG_DECIMAL_ZERO

  user.xFNAAge = BIG_DECIMAL_ZERO
  user.xFNAAgeDestroyed = BIG_DECIMAL_ZERO

  user.xFNAOffset = BIG_DECIMAL_ZERO
  user.finaOffset = BIG_DECIMAL_ZERO
  user.usdOffset = BIG_DECIMAL_ZERO
  user.updatedAt = block.timestamp

  return user as User
}

function getUser(address: Address, block: ethereum.Block): User {
  let user = User.load(address.toHex())

  if (user === null) {
    user = createUser(address, block)
  }

  return user as User
}

function getHistory(block: ethereum.Block): History {
  const day = block.timestamp.toI32() / 86400

  const id = BigInt.fromI32(day).toString()

  let history = History.load(id)

  if (history === null) {
    const date = day * 86400
    history = new History(id)
    history.date = date
    history.timeframe = 'Day'
    history.finaStaked = BIG_DECIMAL_ZERO
    history.finaStakedUSD = BIG_DECIMAL_ZERO
    history.finaHarvested = BIG_DECIMAL_ZERO
    history.finaHarvestedUSD = BIG_DECIMAL_ZERO
    history.xFNAAge = BIG_DECIMAL_ZERO
    history.xFNAAgeDestroyed = BIG_DECIMAL_ZERO
    history.xFNAMinted = BIG_DECIMAL_ZERO
    history.xFNABurned = BIG_DECIMAL_ZERO
    history.xFNASupply = BIG_DECIMAL_ZERO
    history.ratio = BIG_DECIMAL_ZERO
  }

  return history as History
}

export function transfer(event: TransferEvent): void {
  // Convert to BigDecimal with 18 places, 1e18.
  const value = event.params.value.divDecimal(BIG_DECIMAL_1E18)

  // If value is zero, do nothing.
  if (value.equals(BIG_DECIMAL_ZERO)) {
    log.warning('Transfer zero value! Value: {} Tx: {}', [
      event.params.value.toString(),
      event.transaction.hash.toHex(),
    ])
    return
  }

  const bar = getBar(event.block)
  const barContract = BarContract.bind(FINA_LOUNGE_ADDRESS)

  const finaPrice = getFinaPrice()

  bar.totalSupply = barContract.totalSupply().divDecimal(BIG_DECIMAL_1E18)
  bar.finaStaked = FinaTokenContract.bind(FNA_TOKEN_ADDRESS)
    .balanceOf(FINA_LOUNGE_ADDRESS)
    .divDecimal(BIG_DECIMAL_1E18)
  bar.ratio = bar.finaStaked.div(bar.totalSupply)

  const what = value.times(bar.ratio)

  // Minted xFNA
  if (event.params.from == ADDRESS_ZERO) {
    const user = getUser(event.params.to, event.block)

    log.info('{} minted {} xFNA in exchange for {} fina - finaStaked before {} finaStaked after {}', [
      event.params.to.toHex(),
      value.toString(),
      what.toString(),
      user.finaStaked.toString(),
      user.finaStaked.plus(what).toString(),
    ])

    if (user.xFNA == BIG_DECIMAL_ZERO) {
      log.info('{} entered the bar', [user.id])
      user.bar = bar.id
    }

    user.xFNAMinted = user.xFNAMinted.plus(value)

    const finaStakedUSD = what.times(finaPrice)

    user.finaStaked = user.finaStaked.plus(what)
    user.finaStakedUSD = user.finaStakedUSD.plus(finaStakedUSD)

    const days = event.block.timestamp.minus(user.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    const xFNAAge = days.times(user.xFNA)

    user.xFNAAge = user.xFNAAge.plus(xFNAAge)

    // Update last
    user.xFNA = user.xFNA.plus(value)

    user.updatedAt = event.block.timestamp

    user.save()

    const barDays = event.block.timestamp.minus(bar.updatedAt).divDecimal(BigDecimal.fromString('86400'))
    const barXfina = bar.xFNAMinted.minus(bar.xFNABurned)
    bar.xFNAMinted = bar.xFNAMinted.plus(value)
    bar.xFNAAge = bar.xFNAAge.plus(barDays.times(barXfina))
    bar.finaStaked = bar.finaStaked.plus(what)
    bar.finaStakedUSD = bar.finaStakedUSD.plus(finaStakedUSD)
    bar.updatedAt = event.block.timestamp

    const history = getHistory(event.block)
    history.xFNAAge = bar.xFNAAge
    history.xFNAMinted = history.xFNAMinted.plus(value)
    history.xFNASupply = bar.totalSupply
    history.finaStaked = history.finaStaked.plus(what)
    history.finaStakedUSD = history.finaStakedUSD.plus(finaStakedUSD)
    history.ratio = bar.ratio
    history.save()
  }

  // Burned xFNA
  if (event.params.to == ADDRESS_ZERO) {
    log.info('{} burned {} xFNA', [event.params.from.toHex(), value.toString()])

    const user = getUser(event.params.from, event.block)

    user.xFNABurned = user.xFNABurned.plus(value)

    user.finaHarvested = user.finaHarvested.plus(what)

    const finaHarvestedUSD = what.times(finaPrice)

    user.finaHarvestedUSD = user.finaHarvestedUSD.plus(finaHarvestedUSD)

    const days = event.block.timestamp.minus(user.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    const xFNAAge = days.times(user.xFNA)

    user.xFNAAge = user.xFNAAge.plus(xFNAAge)

    const xFNAAgeDestroyed = user.xFNAAge.div(user.xFNA).times(value)

    user.xFNAAgeDestroyed = user.xFNAAgeDestroyed.plus(xFNAAgeDestroyed)

    // remove xFNAAge
    user.xFNAAge = user.xFNAAge.minus(xFNAAgeDestroyed)
    // Update xFNA last
    user.xFNA = user.xFNA.minus(value)

    if (user.xFNA == BIG_DECIMAL_ZERO) {
      log.info('{} left the bar', [user.id])
      user.bar = null
    }

    user.updatedAt = event.block.timestamp

    user.save()

    const barDays = event.block.timestamp.minus(bar.updatedAt).divDecimal(BigDecimal.fromString('86400'))
    const barXfina = bar.xFNAMinted.minus(bar.xFNABurned)
    bar.xFNABurned = bar.xFNABurned.plus(value)
    bar.xFNAAge = bar.xFNAAge.plus(barDays.times(barXfina)).minus(xFNAAgeDestroyed)
    bar.xFNAAgeDestroyed = bar.xFNAAgeDestroyed.plus(xFNAAgeDestroyed)
    bar.finaHarvested = bar.finaHarvested.plus(what)
    bar.finaHarvestedUSD = bar.finaHarvestedUSD.plus(finaHarvestedUSD)
    bar.updatedAt = event.block.timestamp

    const history = getHistory(event.block)
    history.xFNASupply = bar.totalSupply
    history.xFNABurned = history.xFNABurned.plus(value)
    history.xFNAAge = bar.xFNAAge
    history.xFNAAgeDestroyed = history.xFNAAgeDestroyed.plus(xFNAAgeDestroyed)
    history.finaHarvested = history.finaHarvested.plus(what)
    history.finaHarvestedUSD = history.finaHarvestedUSD.plus(finaHarvestedUSD)
    history.ratio = bar.ratio
    history.save()
  }

  // If transfer from address to address and not known xFNA pools.
  if (event.params.from != ADDRESS_ZERO && event.params.to != ADDRESS_ZERO) {
    log.info('transfered {} xFNA from {} to {}', [
      value.toString(),
      event.params.from.toHex(),
      event.params.to.toHex(),
    ])

    const fromUser = getUser(event.params.from, event.block)

    const fromUserDays = event.block.timestamp.minus(fromUser.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    // Recalc xFNA age first
    fromUser.xFNAAge = fromUser.xFNAAge.plus(fromUserDays.times(fromUser.xFNA))
    // Calculate xFNAAge being transfered
    const xFNAAgeTranfered = fromUser.xFNAAge.div(fromUser.xFNA).times(value)
    // Subtract from xFNAAge
    fromUser.xFNAAge = fromUser.xFNAAge.minus(xFNAAgeTranfered)
    fromUser.updatedAt = event.block.timestamp

    fromUser.xFNA = fromUser.xFNA.minus(value)
    fromUser.xFNAOut = fromUser.xFNAOut.plus(value)
    fromUser.finaOut = fromUser.finaOut.plus(what)
    fromUser.usdOut = fromUser.usdOut.plus(what.times(finaPrice))

    if (fromUser.xFNA == BIG_DECIMAL_ZERO) {
      log.info('{} left the bar by transfer OUT', [fromUser.id])
      fromUser.bar = null
    }

    fromUser.save()

    const toUser = getUser(event.params.to, event.block)

    if (toUser.bar === null) {
      log.info('{} entered the bar by transfer IN', [fromUser.id])
      toUser.bar = bar.id
    }

    // Recalculate xFNA age and add incoming xFNAAgeTransfered
    const toUserDays = event.block.timestamp.minus(toUser.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    toUser.xFNAAge = toUser.xFNAAge.plus(toUserDays.times(toUser.xFNA)).plus(xFNAAgeTranfered)
    toUser.updatedAt = event.block.timestamp

    toUser.xFNA = toUser.xFNA.plus(value)
    toUser.xFNAIn = toUser.xFNAIn.plus(value)
    toUser.finaIn = toUser.finaIn.plus(what)
    toUser.usdIn = toUser.usdIn.plus(what.times(finaPrice))

    const difference = toUser.xFNAIn.minus(toUser.xFNAOut).minus(toUser.xFNAOffset)

    // If difference of fina in - fina out - offset > 0, then add on the difference
    // in staked fina based on xFNA:Fina ratio at time of reciept.
    if (difference.gt(BIG_DECIMAL_ZERO)) {
      const fina = toUser.finaIn.minus(toUser.finaOut).minus(toUser.finaOffset)
      const usd = toUser.usdIn.minus(toUser.usdOut).minus(toUser.usdOffset)

      log.info('{} recieved a transfer of {} xFNA from {}, fina value of transfer is {}', [
        toUser.id,
        value.toString(),
        fromUser.id,
        what.toString(),
      ])

      toUser.finaStaked = toUser.finaStaked.plus(fina)
      toUser.finaStakedUSD = toUser.finaStakedUSD.plus(usd)

      toUser.xFNAOffset = toUser.xFNAOffset.plus(difference)
      toUser.finaOffset = toUser.finaOffset.plus(fina)
      toUser.usdOffset = toUser.usdOffset.plus(usd)
    }

    toUser.save()
  }

  bar.save()
}
