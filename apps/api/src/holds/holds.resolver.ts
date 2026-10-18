import { Args, Field, ID, Mutation, ObjectType, Resolver } from '@nestjs/graphql';
import { HoldsService } from './holds.service';

@ObjectType('Hold')
class HoldType {
  @Field(() => ID) id!: string;
  @Field(() => ID) seatId!: string;
  @Field() status!: string;
  @Field() expiresAt!: Date;
}

@Resolver()
export class HoldsResolver {
  constructor(private readonly holds: HoldsService) {}

  // userId comes from args for now; swap for an auth guard (Cognito JWT) later.
  @Mutation(() => HoldType)
  holdSeat(
    @Args('userId') userId: string,
    @Args('eventId', { type: () => ID }) eventId: string,
    @Args('seatId', { type: () => ID }) seatId: string,
  ) {
    return this.holds.holdSeat(userId, eventId, seatId);
  }
}
