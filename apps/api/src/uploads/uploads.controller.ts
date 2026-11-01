import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

export interface UploadedFileInfo {
  id: string;
  originalName: string;
  filename: string;
  size: number;
  mimeType: string;
  url: string;
}

@ApiTags('Uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  @Post()
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const id = randomUUID();
          const ext = extname(file.originalname);
          cb(null, `${id}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File): UploadedFileInfo {
    const id = file.filename.replace(/\.[^.]+$/, '');
    return {
      id,
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      filename: file.filename,
      size: file.size,
      mimeType: file.mimetype,
      url: `/api/uploads/${file.filename}`,
    };
  }

  @Get(':filename')
  @ApiOperation({ summary: 'Download a file' })
  serve(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = join(UPLOAD_DIR, filename);
    if (!existsSync(filePath)) throw new NotFoundException('File not found');
    res.sendFile(filePath);
  }

  @Delete(':filename')
  @ApiOperation({ summary: 'Delete an uploaded file' })
  remove(@Param('filename') filename: string) {
    const filePath = join(UPLOAD_DIR, filename);
    if (!existsSync(filePath)) throw new NotFoundException('File not found');
    unlinkSync(filePath);
    return { message: 'Deleted' };
  }
}
