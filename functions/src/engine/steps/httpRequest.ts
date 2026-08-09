import fetch from 'node-fetch';

export interface HttpRequestConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body_template?: string;
  body?: any;
}

/**
 * Execute a real HTTP request to an external API.
 */
export async function executeHttpRequest(
  config: HttpRequestConfig,
  previousOutput: any
): Promise<any> {
  let { url, method = 'GET', headers = {}, body_template, body } = config;

  // Interpolate variables in URL
  if (previousOutput) {
    url = url.replace(/\{\{previous_output\.(\w+)\}\}/g, (_match, key) => {
      return previousOutput[key] !== undefined ? String(previousOutput[key]) : '';
    });
  }

  // Build request body
  let requestBody: string | undefined;
  if (body_template && previousOutput) {
    requestBody = body_template.replace(
      /\{\{previous_output\.(\w+)\}\}/g,
      (_match, key) => {
        const val = previousOutput[key];
        return val !== undefined ? (typeof val === 'string' ? val : JSON.stringify(val)) : '';
      }
    );
  } else if (body) {
    requestBody = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const options: any = {
    method: method.toUpperCase(),
    headers,
    timeout: 30000, // 30s timeout
  };

  if (requestBody && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    options.body = requestBody;
    if (!headers['Content-Type'] && !headers['content-type']) {
      options.headers['Content-Type'] = 'application/json';
    }
  }

  const response = await fetch(url, options);
  const responseText = await response.text();

  let responseData: any;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { body: responseText };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 500)}`);
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    data: responseData,
  };
}
