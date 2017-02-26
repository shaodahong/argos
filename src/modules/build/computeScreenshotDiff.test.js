import S3 from 'aws-sdk/clients/s3'
import { useDatabase, setTestsTimeout } from 'server/test/utils'
import factory from 'server/test/factory'
import computeScreenshotDiff from './computeScreenshotDiff'

jest.mock('modules/build/notifyStatus')
const { notifyFailure, notifySuccess } = require('modules/build/notifyStatus')

describe('computeScreenshotDiff', () => {
  useDatabase()
  setTestsTimeout(10000)

  let baseBucket
  let build
  let compareBucket
  let s3
  let screenshotDiff

  beforeEach(async () => {
    s3 = new S3({ signatureVersion: 'v4' })

    const repository = await factory.create('Repository', {
      enabled: true,
      token: 'xx',
    })
    compareBucket = await factory.create('ScreenshotBucket', {
      name: 'test-bucket',
      branch: 'test-branch',
      repositoryId: repository.id,
    })
    baseBucket = await factory.create('ScreenshotBucket', {
      name: 'base-bucket',
      branch: 'master',
      repositoryId: repository.id,
    })
    build = await factory.create('Build', {
      baseScreenshotBucketId: baseBucket.id,
      compareScreenshotBucketId: compareBucket.id,
      repositoryId: repository.id,
    })
  })

  describe('with two different screenshots', () => {
    beforeEach(async () => {
      const compareScreenshot = await factory.create('Screenshot', {
        name: 'penelope',
        s3Id: 'penelope-argos.jpg',
        screenshotBucketId: compareBucket.id,
      })
      const baseScreenshot = await factory.create('Screenshot', {
        name: 'penelope',
        s3Id: 'penelope.jpg',
        screenshotBucketId: baseBucket.id,
      })
      screenshotDiff = await factory.create('ScreenshotDiff', {
        buildId: build.id,
        baseScreenshotId: baseScreenshot.id,
        compareScreenshotId: compareScreenshot.id,
        jobStatus: 'pending',
        validationStatus: 'unknown',
      })
    })

    it('should update result and notify failure', async () => {
      await computeScreenshotDiff(screenshotDiff, {
        s3,
        bucket: 'argos-screenshots-sandbox',
      })

      await screenshotDiff.reload()
      expect(screenshotDiff.score > 0).toBe(true)
      expect(typeof screenshotDiff.s3Id === 'string').toBe(true)
      expect(notifyFailure).toBeCalledWith(build.id)
    })
  })

  describe('with two same screenshots', () => {
    beforeEach(async () => {
      const compareScreenshot = await factory.create('Screenshot', {
        name: 'penelope',
        s3Id: 'penelope.jpg',
        screenshotBucketId: compareBucket.id,
      })
      const baseScreenshot = await factory.create('Screenshot', {
        name: 'penelope',
        s3Id: 'penelope.jpg',
        screenshotBucketId: baseBucket.id,
      })
      screenshotDiff = await factory.create('ScreenshotDiff', {
        buildId: build.id,
        baseScreenshotId: baseScreenshot.id,
        compareScreenshotId: compareScreenshot.id,
        jobStatus: 'pending',
        validationStatus: 'unknown',
      })
    })

    it('should not update result and notify success', async () => {
      await computeScreenshotDiff(screenshotDiff, {
        s3,
        bucket: 'argos-screenshots-sandbox',
      })

      await screenshotDiff.reload()
      expect(screenshotDiff.score).toBe(0)
      expect(screenshotDiff.s3Id).toBe(null)
      expect(notifySuccess).toBeCalledWith(build.id)
    })
  })
})
