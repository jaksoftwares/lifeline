import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { type z } from 'zod';

export interface FieldError {
  path: string;
  message: string;
}

/** Validates and parses a request body or query with a shared @lifeline/schemas schema. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const errors: FieldError[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new BadRequestException({
      statusCode: 400,
      message: 'Some fields need attention.',
      errors,
    });
  }
}
