import { FinaMaster } from '../../generated/schema'
import { dataSource, ethereum } from '@graphprotocol/graph-ts'
import { BIG_INT_ZERO } from 'const'

export function getFinaMaster(block: ethereum.Block): FinaMaster {
  let finaMaster = FinaMaster.load(dataSource.address().toHex())

  if (finaMaster === null) {
    finaMaster = new FinaMaster(dataSource.address().toHex())
    finaMaster.totalAllocPoint = BIG_INT_ZERO
    finaMaster.poolCount = BIG_INT_ZERO
  }

  finaMaster.timestamp = block.timestamp
  finaMaster.block = block.number
  finaMaster.save()

  return finaMaster as FinaMaster
}
