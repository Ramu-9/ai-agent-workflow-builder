import { ApolloClient, InMemoryCache, split, HttpLink, ApolloProvider } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { nhost } from './nhost';
import { setContext } from '@apollo/client/link/context';
import { useMemo } from 'react';

export function createApolloClient() {
  const graphqlUrl = nhost.graphql.httpUrl;
  
  // Create an http link:
  const httpLink = new HttpLink({
    uri: graphqlUrl,
  });

  const wsUrl = graphqlUrl.replace(/^https?:\/\//, (match) => 
    match === 'https://' ? 'wss://' : 'ws://'
  );

  const authLink = setContext(async (_, { headers }) => {
    const token = await nhost.auth.getAccessToken();
    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : '',
      }
    }
  });

  // Create a WebSocket link:
  const wsLink = typeof window !== 'undefined'
    ? new GraphQLWsLink(createClient({
        url: wsUrl,
        connectionParams: async () => {
          const token = await nhost.auth.getAccessToken();
          return {
            headers: {
              Authorization: token ? `Bearer ${token}` : '',
            }
          };
        }
      }))
    : null;

  // using the ability to split links, you can send data to each link
  // depending on what kind of operation is being sent
  const splitLink = typeof window !== 'undefined' && wsLink != null
    ? split(
        ({ query }) => {
          const definition = getMainDefinition(query);
          return (
            definition.kind === 'OperationDefinition' &&
            definition.operation === 'subscription'
          );
        },
        wsLink,
        authLink.concat(httpLink),
      )
    : authLink.concat(httpLink);

  return new ApolloClient({
    link: splitLink,
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: {
        fetchPolicy: 'cache-and-network',
      },
    },
  });
}

export function useApolloClient() {
  return useMemo(() => createApolloClient(), []);
}
