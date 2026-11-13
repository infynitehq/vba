import { execFileSync } from 'node:child_process';
import {
  cli,
  distributionRepo,
  isMain,
  releaseEndpoint,
} from './release-utils.mjs';

if (isMain(import.meta.url))
  cli(() => {
    const repo = distributionRepo(process.env.DESKTOP_UPDATE_REPOSITORY);
    releaseEndpoint(repo, process.env.DESKTOP_UPDATE_ENDPOINT);
    const result = JSON.parse(
      execFileSync('gh', ['api', `repos/${repo}`], { encoding: 'utf8' }),
    );
    if (result.private || result.visibility !== 'public')
      throw new Error('Updater distribution repository must be public');
  });
