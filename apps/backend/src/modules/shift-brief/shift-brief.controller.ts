/**
 * Shift Brief controller (OWN ADDITION, not upstream).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '@nodedr-restaurant/types';
import { z } from 'zod';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { ShiftBriefService } from './shift-brief.service';

const askSchema = z.object({
  branchId: z.string().min(1),
  question: z.string().min(1).max(500),
});
type AskDto = z.infer<typeof askSchema>;

@ApiTags('shift-brief')
@Controller('v1/shift-brief')
export class ShiftBriefController {
  constructor(
    private readonly brief: ShiftBriefService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Auth('dashboard.sales.view')
  @Get('today')
  async getBrief(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    if (!branchId) throw new BadRequestException('branchId is required');
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.brief.getBrief(branchId);
  }

  @Auth('dashboard.sales.view')
  @Post('ask')
  @UsePipes(new ZodValidationPipe(askSchema))
  async ask(@CurrentUser() user: SessionUser, @Body() body: AskDto) {
    await this.branchAccess.assertAccess(user.restaurantId, body.branchId);
    return this.brief.ask(body.branchId, body.question);
  }
}
