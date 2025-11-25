/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { LogoProps } from '../types';

const Logo = (props: LogoProps) => (
  <svg
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    x="0"
    y="0"
    width="32px"
    height="32px"
    viewBox="0 0 32 32"
    enableBackground="new 0 0 32 32"
    xmlSpace="preserve"
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      fill="currentColor"
      d="M16 0C7.164 0 0 7.164 0 16c0 7.072 4.584 13.064 10.94 15.18.8.15 1.092-.348 1.092-.772 0-.38-.008-1.388-.012-2.724-4.45.968-5.39-2.146-5.39-2.146-.728-1.85-1.776-2.344-1.776-2.344-1.452-.992.11-.992.11-.992 1.606.112 2.452 1.648 2.452 1.648 1.426 2.444 3.74 1.74 4.654 1.33.146-1.034.558-1.74 1.016-2.142-3.554-.404-7.292-1.778-7.292-7.92 0-1.75.624-3.18 1.646-4.302-.164-.404-.714-2.03.156-4.234 0 0 1.342-.43 4.4 1.642 1.276-.356 2.646-.534 4.006-.54 1.36.006 2.73.184 4.006.54 3.056-2.072 4.396-1.642 4.396-1.642.872 2.204.322 3.83.158 4.234 1.024 1.122 1.644 2.552 1.644 4.302 0 6.156-3.744 7.512-7.304 7.91.574.496 1.086 1.472 1.086 2.968 0 2.144-.02 3.872-.02 4.396 0 .428.29.928 1.1.772C27.42 29.06 32 23.068 32 16 32 7.164 24.836 0 16 0z"
    />
  </svg>
);

// eslint-disable-next-line import/no-default-export
export default Logo;

