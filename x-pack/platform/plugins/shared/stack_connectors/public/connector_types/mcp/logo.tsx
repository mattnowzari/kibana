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
    <rect width="32" height="32" rx="4" fill="#006BB4" />
    <text
      x="16"
      y="22"
      fontSize="18"
      fontWeight="bold"
      fill="white"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
    >
      MCP
    </text>
  </svg>
);

// eslint-disable-next-line import/no-default-export
export { Logo as default };

