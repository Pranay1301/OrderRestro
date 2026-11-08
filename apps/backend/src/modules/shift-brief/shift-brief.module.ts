import { Module } from '@nestjs/common';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { ShiftBriefController } from './shift-brief.controller';
import { ShiftBriefService } from './shift-brief.service';

@Module({
  controllers: [ShiftBriefController],
  providers: [ShiftBriefService, BranchAccessService],
  exports: [ShiftBriefService],
})
export class ShiftBriefModule {}
