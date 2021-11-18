import { Address, BigInt, log } from '@graphprotocol/graph-ts'

import { StakingRewardsFina as StakingRewardsContract} from '../../generated/templates/StakingRewardsFina/StakingRewardsFina'
import { RewardAdded } from '../../generated/templates/StakingRewardsFina/StakingRewardsFina'
import { getRewarder } from '../entities'

export function rewardAdded(event: RewardAdded): void {
  log.info('[FinaMasterV2:StakingRewarder] Log Reward Added {}', [
    event.params.reward.toString()
  ])
  const rewarderContract = StakingRewardsContract.bind(event.address)

  const rewarder = getRewarder(event.address, event.block)
  rewarder.rewardPerSecond = rewarderContract.rewardPerSecond()
  rewarder.save()
}
