import { useUIStore } from "../uiStore";

beforeEach(() => {
  useUIStore.setState({
    panelSizes: {
      sidebarWidth: 240,
      rightPanelWidth: 320,
      terminalHeight: 60,
      rightOutputHeight: 200,
    },
    rightPanelTab: "changes",
    rightPanelCollapsed: false,
    sidebarCollapsed: false,
    soundEnabled: true,
  });
});

describe("uiStore", () => {
  it("has correct default panel sizes", () => {
    const { panelSizes } = useUIStore.getState();
    expect(panelSizes.sidebarWidth).toBe(240);
    expect(panelSizes.rightPanelWidth).toBe(320);
    expect(panelSizes.terminalHeight).toBe(60);
    expect(panelSizes.rightOutputHeight).toBe(200);
  });

  it("setPanelSize updates a single dimension", () => {
    useUIStore.getState().setPanelSize("sidebarWidth", 300);
    expect(useUIStore.getState().panelSizes.sidebarWidth).toBe(300);
    expect(useUIStore.getState().panelSizes.rightPanelWidth).toBe(320);
  });

  it("setRightPanelTab changes tab and un-collapses", () => {
    useUIStore.setState({ rightPanelCollapsed: true });
    useUIStore.getState().setRightPanelTab("files");
    const state = useUIStore.getState();
    expect(state.rightPanelTab).toBe("files");
    expect(state.rightPanelCollapsed).toBe(false);
  });

  it("toggleRightPanel toggles collapsed state", () => {
    expect(useUIStore.getState().rightPanelCollapsed).toBe(false);
    useUIStore.getState().toggleRightPanel();
    expect(useUIStore.getState().rightPanelCollapsed).toBe(true);
    useUIStore.getState().toggleRightPanel();
    expect(useUIStore.getState().rightPanelCollapsed).toBe(false);
  });

  it("toggleSidebar toggles collapsed state", () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it("toggleSound toggles soundEnabled", () => {
    expect(useUIStore.getState().soundEnabled).toBe(true);
    useUIStore.getState().toggleSound();
    expect(useUIStore.getState().soundEnabled).toBe(false);
    useUIStore.getState().toggleSound();
    expect(useUIStore.getState().soundEnabled).toBe(true);
  });

  it("defaults to changes tab", () => {
    expect(useUIStore.getState().rightPanelTab).toBe("changes");
  });
});
