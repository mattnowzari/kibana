/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExecutorParams } from '@kbn/actions-plugin/server/sub_action_framework/types';
import type { ListRepositoriesActionParams } from '../../../common/github/types';
import { SUB_ACTION } from '../../../common/github/constants';

export interface GitHubExecuteActionParams extends ExecutorParams {
  subAction: SUB_ACTION;
  subActionParams: ListRepositoriesActionParams;
}

