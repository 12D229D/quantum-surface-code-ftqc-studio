# Quantum Surface Code & FTQC Studio

**Quantum Surface Code & FTQC Studio** es una herramienta interactiva de vanguardia diseñada para la exploración visual, inyección de ruido físico y decodificación de síndromes de códigos de superficie 2D (Rotated Planar Surface Code y Toric Code) en Computación Cuántica Tolerante a Fallos (FTQC - *Fault-Tolerant Quantum Computing*).

---

## 🔬 Fundamentos Cuánticos y Formulación Matemática

El código de superficie es el principal candidato de corrección de errores cuánticos (QEC) para arquitecturas de qubits superconductores e iones atrapados debido a su geometría 2D de interacciones exclusivamente locales y su alto umbral de tolerancia a fallos ($p_{th} \approx 1\%$).

### 1. Espacio de Estabilizadores (Clifford Group)
Un código de superficie con distancia $d$ codifica 1 qubit lógico ($k=1$) en $n = d^2$ data qubits protegidos por $n - 1$ generadores estabilizadores independientes $S = \langle g_1, g_2, \dots, g_{n-1} \rangle$, donde cada $g_i$ es un operador producto de Pauli hermítico e involutivo:

$$g_i \in \{+1, -1\} \times \{I, X, Y, Z\}^{\otimes n}, \quad g_i^2 = I, \quad [g_i, g_j] = 0 \quad \forall i, j$$

El estado lógico $|0_L\rangle$ reside en el subespacio fijado por el valor propio $+1$ de todos los estabilizadores:
$$g_i |\psi_L\rangle = +|\psi_L\rangle \quad \forall i$$

### 2. Estabilizadores Plaquette y Vértice
- **Estabilizadores Plaquette $Z$ (Medición de paridad de fase):**
  $$B_p = \prod_{j \in \partial p} Z_j$$
  Detectan errores de inversión de bit (Pauli $X$ y $Y$).
- **Estabilizadores Vértice $X$ (Medición de paridad de bit):**
  $$A_s = \prod_{j \in \delta s} X_j$$
  Detectan errores de inversión de fase (Pauli $Z$ y $Y$).

### 3. Síndromes y Emparejamiento de Peso Mínimo (MWPM)
Cuando un canal de despolarización estocástico introduce errores $\mathcal{E}$, ciertos estabilizadores anticonmutan con el error, proyectando la ancilla asociada a un valor propio $-1$ (síndrome detectado o "defecto"):

$$S_k \mathcal{E} = (-1)^{c_k} \mathcal{E} S_k \implies \text{Medición: } c_k = 1$$

El decodificador **MWPM** (estilo algoritmo Blossom / PyMatching) modela los defectos activos como nodos en un grafo dual completo $G = (V, E)$, buscando un subgrafo de emparejamiento perfecto $M \subseteq E$ que minimice la distancia euclídea/Manhattan total:

$$\min \sum_{(u, v) \in M} \text{dist}(u, v)$$

Una vez emparejados los síndromes, se aplican operadores de corrección unitaria a lo largo de las cadenas homológicas para devolver el sistema al subespacio de código sin colapsar la superposición coherente.

### 4. Supresión Exponencial del Error Lógico y Umbral
En el régimen sub-umbral ($p < p_{th}$ con $p_{th} \approx 1.05\%$), la tasa de error del qubit lógico $P_L$ disminuye exponencialmente con la distancia de código $d$:

$$P_L \propto \left( \frac{p}{p_{th}} \right)^{(d+1)/2}$$

---

## 🚀 Características Principales

1. **Lienzo Gráfico Cuántico Interactivo:** Visualización en tiempo real de data qubits y plaquettes con codificación HSL (Cian para estabilizadores $X$, Violeta para estabilizadores $Z$, y Rojo para síndromes activos).
2. **Inyección de Ruido Pauli & Medición:** Inyector estocástico de errores depolarizantes y volteos de fase, además de alternador manual interactivo de errores mediante clics directos sobre la celosía.
3. **Decodificadores Visuales:**
   - **MWPM (Minimum-Weight Perfect Matching):** Dibuja en tiempo real las trayectorias mínimas de emparejamiento de síndromes.
   - **Union-Find (UF):** Crecimiento voraz de clusters con complejidad casi lineal $O(N \alpha(N))$.
4. **Calculador de Fidelidad y Métricas:** Estimación analítica en tiempo real de la tasa de error lógico y fidelidad del qubit.
5. **Transpilador y Exportador Multiformato:**
   - **Google Stim:** Generación de sintaxis nativa con coordenadas `QUBIT_COORDS` y `DETECTOR` para benchmarking en PyMatching y Sinter.
   - **OpenQASM 3.0:** Circuitos estándar compatibles con IBM Qiskit y Google Cirq.
   - **Qiskit Python:** Código ejecutable en simuladores Aer y hardware Eagle/Heron.
6. **Persistencia Determinista Local (SQLite):** Historial con hash determinista de ejecuciones para auditoría de pruebas de fidelidad.

---

## 🛠️ Tecnologías Utilizadas
- **HTML5 Semántico & Vanilla CSS (HSL Cyber-Quantum Dark Mode)**
- **JavaScript ES2024 Modules**
- **Tipografía:** Google Fonts (`JetBrains Mono` + `Inter`)
