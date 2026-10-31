import { Controller, Get, Param } from '@nestjs/common';
import { type InstitutionSummary } from '@lifeline/schemas';
import { assertNetworkMember, Auth, AuthContext } from '../auth/auth-context';
import { PrismaService } from '../prisma/prisma.service';

@Controller('networks/:networkId/institutions')
export class InstitutionsController {
  constructor(private readonly prisma: PrismaService) {}

  /** The network directory is visible to every member of the network. */
  @Get()
  async list(
    @Auth() auth: AuthContext,
    @Param('networkId') networkId: string,
  ): Promise<InstitutionSummary[]> {
    assertNetworkMember(auth, networkId);
    return this.prisma.institution.findMany({
      where: { networkId },
      orderBy: [{ type: 'asc' }, { level: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        networkId: true,
        type: true,
        name: true,
        code: true,
        level: true,
        county: true,
        status: true,
      },
    });
  }
}
