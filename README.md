# 🤖 @webautomations/mcp-server (MCP)

> **Versão:** `0.1.0`  
> **Protocolo:** Model Context Protocol (MCP) via STDIO + WebSocket Bridge  
> **Papel:** Conectar Modelos de Linguagem (LLMs) diretamente ao ambiente de execução WebAutomations no navegador.

---

## 🎯 Visão Geral

O módulo **MCP** expõe o ecossistema WebAutomations para ferramentas de Inteligência Artificial (como Claude Desktop, Antigravity, Cursor e outros clientes MCP).

Ele cria uma ponte bidirecional:
1. **Com o Cliente MCP (LLM)**: Comunicação via canal padrão `stdio` utilizando `@modelcontextprotocol/sdk`.
2. **Com a Extensão de Browser**: Servidor WebSocket local (`ws://localhost:3001`) que despacha comandos para a extensão ativa e devolve os dados de execução e variáveis de volta para a IA.

---

## 🛠️ Ferramentas (Tools) Expostas

| Ferramenta | Descrição |
|---|---|
| `run_web_automation` | Executa um grafo `.webautomation.json` diretamente no navegador do usuário e aguarda o resultado. |
| `list_browser_automations` | Lista os fluxos salvos disponíveis no storage local da extensão. |
| `get_execution_status` | Obtém o status da última execução e o mapa de variáveis extraídas. |

Também expõe o schema JSON sob a URI de resource: `webautomation://schema`.

---

## 🚀 Como Compilar e Executar

Dentro do diretório `MCP`:

```bash
# Instalar dependências
npm install

# Compilar TypeScript para dist/
npm run build

# Iniciar servidor manualmente (para testes STDIO)
npm run start
```

---

## ⚙️ Configuração em Clientes MCP

### No Claude Desktop (`claude_desktop_config.json`) ou Antigravity (`mcp_config.json`):

```json
{
  "mcpServers": {
    "webautomations": {
      "command": "node",
      "args": [
        "c:/Users/juanc/Documents/GitHub/WebAutomations/MCP/dist/server.js"
      ]
    }
  }
}
```

> **Nota:** Certifique-se de que a extensão WebAutomations esteja carregada e ativa no navegador para que a conexão WebSocket na porta `3001` seja estabelecida com sucesso ao rodar comandos.

---

## 📂 Estrutura do Módulo

```
MCP/
├── src/
│   └── server.ts      # Servidor MCP, registro de ferramentas e WebSocket bridge
├── dist/
│   └── server.js      # Ponto de entrada compilado para execução
├── tsconfig.json      # Configurações do TypeScript
└── package.json       # Versão 0.1.0
```

---

## 🏷️ Regras de Versionamento

- **Fix (`0.1.x`)**: Correções de comunicação WebSocket, resolução de payloads MCP ou tratamento de erros.
- **Minor (`0.x.0`)**: Inclusão de novas ferramentas MCP, novos recursos (resources) ou novos protocolos de comunicação.
