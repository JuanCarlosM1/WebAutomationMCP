/**
 * Servidor MCP (Model Context Protocol) para WebAutomations
 * Permite que LLMs invoquem fluxos, inspecionem variáveis e coletem dados do navegador
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';

class WebAutomationsMCPServer {
  private server: Server;
  private wss?: WebSocketServer;
  private extensionSocket?: WebSocket;
  private pendingRequests: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'webautomations-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.initWebSocketBridge(3001);
    this.setupTools();
    this.setupResources();
  }

  private initWebSocketBridge(port: number): void {
    try {
      this.wss = new WebSocketServer({ port });
      console.error(`[MCP Bridge] WebSocket Server escutando na porta ${port}...`);

      this.wss.on('connection', (ws) => {
        console.error('[MCP Bridge] Extensão do navegador conectada!');
        this.extensionSocket = ws;

        ws.on('message', (raw) => {
          try {
            const data = JSON.parse(raw.toString());
            if (data.type === 'MCP_RESPONSE' && data.id) {
              const req = this.pendingRequests.get(data.id);
              if (req) {
                if (data.success) req.resolve(data);
                else req.reject(new Error(data.error || 'Erro desconhecido na extensão'));
                this.pendingRequests.delete(data.id);
              }
            }
          } catch (e) {
            console.error('[MCP Bridge] Erro ao analisar mensagem da extensão:', e);
          }
        });

        ws.on('close', () => {
          console.error('[MCP Bridge] Extensão desconectada.');
          this.extensionSocket = undefined;
        });
      });
    } catch (err) {
      console.error('[MCP Bridge] Falha ao iniciar WebSocket Bridge:', err);
    }
  }

  private sendToExtension(action: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.extensionSocket || this.extensionSocket.readyState !== WebSocket.OPEN) {
        return reject(new Error('A extensão do navegador não está conectada no momento. Certifique-se de que o navegador e a extensão estão abertos.'));
      }

      const id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      this.pendingRequests.set(id, { resolve, reject });

      // Timeout de segurança para a resposta da extensão (60s)
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Timeout aguardando resposta da extensão do navegador.'));
        }
      }, 60000);

      this.extensionSocket.send(JSON.stringify({ id, action, payload }));
    });
  }

  private setupTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'run_web_automation',
            description: 'Executa um fluxo de automação web (.webautomation.json) completo no navegador do usuário.',
            inputSchema: {
              type: 'object',
              properties: {
                graph: {
                  type: 'object',
                  description: 'Objeto de grafo com nodes e edges no formato WebAutomationGraph.',
                },
                filePath: {
                  type: 'string',
                  description: 'Caminho absoluto para um arquivo .webautomation.json local a ser executado.',
                },
                overrideVariables: {
                  type: 'object',
                  description: 'Dicionário de variáveis para sobrescrever as variáveis padrão do fluxo.',
                },
              },
            },
          },
          {
            name: 'list_browser_automations',
            description: 'Lista todas as automações salvas na extensão do navegador.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_execution_status',
            description: 'Consulta o status de execução de uma automação e as variáveis atuais do estado.',
            inputSchema: {
              type: 'object',
              properties: {
                automationId: {
                  type: 'string',
                  description: 'ID da automação consultada.',
                },
              },
              required: ['automationId'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === 'run_web_automation') {
          let graph = (args as any)?.graph;
          const filePath = (args as any)?.filePath;

          if (!graph && filePath) {
            if (fs.existsSync(filePath)) {
              graph = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            } else {
              throw new Error(`Arquivo não encontrado: ${filePath}`);
            }
          }

          if (!graph) {
            throw new Error('É necessário fornecer o parâmetro "graph" ou "filePath".');
          }

          if ((args as any)?.overrideVariables) {
            graph.variables = { ...graph.variables, ...(args as any).overrideVariables };
          }

          const result = await this.sendToExtension('RUN_GRAPH', { graph });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: result.status,
                    variables: result.variables,
                    logsCount: result.logs?.length || 0,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === 'list_browser_automations') {
          const result = await this.sendToExtension('LIST_AUTOMATIONS', {});
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result.data, null, 2),
              },
            ],
          };
        }

        if (name === 'get_execution_status') {
          const result = await this.sendToExtension('GET_STATUS', {
            automationId: (args as any).automationId,
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        throw new Error(`Ferramenta desconhecida: ${name}`);
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Erro ao executar ferramenta ${name}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupResources(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'webautomation://schema',
            name: 'WebAutomation Schema Specification',
            mimeType: 'application/json',
            description: 'Especificação do formato .webautomation.json e lista de blocos suportados.',
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (request.params.uri === 'webautomation://schema') {
        const schemaPath = path.resolve(__dirname, '../../BibliotecaDeDev/src/types/schema.ts');
        let content = '';
        if (fs.existsSync(schemaPath)) {
          content = fs.readFileSync(schemaPath, 'utf-8');
        } else {
          content = '// Schema file available at BibliotecaDeDev/src/types/schema.ts';
        }

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'text/plain',
              text: content,
            },
          ],
        };
      }

      throw new Error(`Recurso não encontrado: ${request.params.uri}`);
    });
  }

  public async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[WebAutomations MCP] Servidor MCP conectado via STDIO com sucesso.');
  }
}

const mcpServer = new WebAutomationsMCPServer();
mcpServer.start().catch((err) => {
  console.error('[WebAutomations MCP] Erro fatal:', err);
  process.exit(1);
});
