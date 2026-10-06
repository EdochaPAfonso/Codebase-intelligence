import { Injectable } from '@nestjs/common';
import { Type } from 'class-transformer';
import { SomeDependency } from './SomeDependency.js';

export interface ChunkDto {
  id: string;
}

export type ChunkAlias = string | number;

export class LargeService {
  public property = 123;
  
  constructor(private readonly dep: SomeDependency) {}

  public async methodOne(): Promise<void> {
    console.log('1');
    console.log('2');
    console.log('3');
    console.log('4');
    console.log('5');
    console.log('6');
  }

  public async methodTwo(): Promise<void> {
    console.log('a');
    console.log('b');
    console.log('c');
  }
}

export function standaloneFunction() {
  return true;
}
