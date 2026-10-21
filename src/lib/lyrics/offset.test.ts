import { describe, expect, it } from 'vitest';
import { medianOffset, needsCalibration } from './offset';

describe('needsCalibration', () => {
  it('is true when the video is more than 10 s longer than the lyrics', () => {
    expect(needsCalibration(201, 175)).toBe(true);
    expect(needsCalibration(186, 175)).toBe(true);
  });

  it('is false at 10 s or less', () => {
    expect(needsCalibration(185, 175)).toBe(false);
    expect(needsCalibration(180, 175)).toBe(false);
  });

  it('is false when the video is the same length or shorter', () => {
    expect(needsCalibration(175, 175)).toBe(false);
    expect(needsCalibration(150, 175)).toBe(false);
  });
});

describe('medianOffset', () => {
  it('is 0 when nobody voted', () => {
    expect(medianOffset([])).toBe(0);
  });

  it('takes the middle vote, so one wild vote does not move it', () => {
    expect(medianOffset([26000, 25500, 40000])).toBe(26000);
    expect(medianOffset([5000])).toBe(5000);
  });

  it('averages the two middle votes when the count is even', () => {
    expect(medianOffset([1000, 2000])).toBe(1500);
    expect(medianOffset([4000, 1000, 3000, 2000])).toBe(2500);
  });

  it('sorts by value, not as text', () => {
    expect(medianOffset([9000, 10000, 100000])).toBe(10000);
  });

  it('accepts negative votes', () => {
    expect(medianOffset([-500, 500, 0])).toBe(0);
    expect(medianOffset([-3000, -1000])).toBe(-2000);
  });

  it('leaves the votes array as it was', () => {
    const votes = [3000, 1000, 2000];
    medianOffset(votes);
    expect(votes).toEqual([3000, 1000, 2000]);
  });
});
