import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Seat {
  @Field(() => ID) id!: string;
  @Field() section!: string;
  @Field() rowLabel!: string;
  @Field(() => Int) number!: number;
  @Field({ description: 'True if the seat has an active hold or booking' }) taken!: boolean;
}

@ObjectType()
export class Event {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() startsAt!: Date;
  @Field() onSaleAt!: Date;
}
