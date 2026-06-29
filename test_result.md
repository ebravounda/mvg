#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Sistema MVG Computación (PWA/Expo) para gestión de órdenes de servicio.
  En esta iteración: completar el flujo de Asignación Masiva MANUAL en el Admin
  panel — el administrador marca múltiples órdenes con checkboxes, abre un
  modal para elegir un técnico y las asigna en lote.

backend:
  - task: "POST /api/admin/ordenes/asignar-bulk (Asignación masiva manual)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Endpoint ya existía. Acepta payload {orden_ids: [string], tecnico_id: string}.
          Asigna las órdenes seleccionadas a un único técnico específico, valida la
          existencia del técnico, hace update_many en MongoDB y dispara WhatsApp
          por cada orden. Retorna {asignadas, whatsapps_enviados, tecnico}.
          REQUIERE TEST: enviar 2-3 orden_ids con un tecnico_id válido y verificar
          la respuesta + persistencia en DB.

  - task: "POST /api/admin/ordenes/asignar-masivo (Auto-distribución por cercanía)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Endpoint ya funcionaba en sesión anterior. Sin cambios en lógica.

  - task: "GET /api/tecnico/ruta (Ordenamiento por comuna/región/dirección)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Endpoint ya existe. Calcula ruta priorizando comuna del técnico,
          luego región, dirección y proximidad. Sin cambios en esta iteración.

frontend:
  - task: "UI Asignación Masiva Manual en /(admin)/ordenes"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(admin)/ordenes/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Implementado el flujo completo:
          - Botón "Seleccionar" en header (también opción dentro del FormSheet de Nueva Orden)
          - Modo selección activa checkboxes en cada tarjeta/fila (mobile FlatList + desktop table)
          - Soporte long-press para activar modo selección en móvil
          - Barra inferior pegajosa muestra count + botón "Asignar"
          - Botón "Todas" para seleccionar todas las visibles
          - Modal FormSheet abre con Select de técnico + botón "Asignar N órdenes"
          - Llama POST /admin/ordenes/asignar-bulk con orden_ids + tecnico_id
          - Resaltado visual de filas seleccionadas (border + background primary)
          - Toast de éxito/error + recarga lista tras éxito
          Verificado visualmente con screenshots. Pendiente test funcional end-to-end.

  - task: "Deep links Waze + Google Maps en /(tecnico)/ruta"
    implemented: true
    working: true
    file: "/app/frontend/app/(tecnico)/ruta.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Ya estaba implementado en sesión anterior. Botones "Waze" y "Google Maps"
          por cada punto de la ruta usando Linking.openURL con universal links
          (https://waze.com/ul?q=... y https://www.google.com/maps/search/...).
          Sin cambios en esta iteración — solo se confirmó funcionamiento.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "POST /api/admin/ordenes/asignar-bulk (Asignación masiva manual)"
    - "UI Asignación Masiva Manual en /(admin)/ordenes"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Sesión retomada. Completé la UI de Asignación Masiva Manual que quedó a medias
      en la sesión anterior. Detalles importantes:
      
      1) El endpoint backend correcto es POST /api/admin/ordenes/asignar-bulk
         (NO /asignar-masivo, ese es para autodistribución por cercanía).
         Payload: { orden_ids: ["id1","id2"], tecnico_id: "uuid" }
      
      2) Corrí el flujo visualmente en desktop (1440x900) y todo se ve correcto:
         - Botón "Seleccionar" en header activa modo selección
         - Checkboxes aparecen en filas
         - Click en filas las marca (resaltado azul)
         - Barra inferior con "N seleccionadas" + botón "Asignar"
         - Modal abre con lista de técnicos
         - Botón "Asignar 2 órdenes" gatilla POST
      
      3) Credenciales admin: admin@mvg.cl / Admin123!
      
      PRUEBAS REQUERIDAS (testing_agent):
      - Backend: probar /api/admin/ordenes/asignar-bulk con payload válido (2-3 órdenes
        pendientes existentes + un tecnico_id válido). Verificar respuesta y que las
        órdenes queden con tecnico_id en DB.
      - Backend edge cases: orden_ids vacío (debe devolver 400), tecnico_id inexistente
        (debe devolver 404).
      - Frontend: login admin → /(admin)/ordenes → click "Seleccionar" → click 2 filas
        → click "Asignar" → seleccionar técnico → confirmar → verificar toast de éxito
        y que las órdenes muestren ese técnico al recargar.
      - Frontend: verificar que en modo selección, click en una fila NO navega al
        detalle de orden sino que la marca/desmarca.

