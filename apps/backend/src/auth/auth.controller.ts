import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LdapLoginDto } from './dto/ldap-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('ldap/login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate an employee against Active Directory' })
  @ApiUnauthorizedResponse({ description: 'Invalid username or password' })
  loginWithLdap(@Body() body: LdapLoginDto) {
    return this.auth.loginWithLdap(body.username, body.password);
  }

  @Post('local/login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate the emergency local super administrator' })
  @ApiUnauthorizedResponse({ description: 'Invalid username or password' })
  loginLocal(@Body() body: LdapLoginDto) {
    return this.auth.loginLocal(body.username, body.password);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new access token' })
  @ApiUnauthorizedResponse({ description: 'Refresh token is invalid or expired' })
  refresh(@Body() body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  logout(@Body() body: RefreshTokenDto) {
    return this.auth.logout(body.refreshToken);
  }
}
