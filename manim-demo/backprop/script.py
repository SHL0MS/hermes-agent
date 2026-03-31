from manim import *
import numpy as np

# === STYLE CONTRACT ===
BG = "#0D1117"
PRIMARY = "#58C4DD"
SECONDARY = "#83C167"
ACCENT = "#FFFF00"
HIGHLIGHT = "#FF6B6B"
GRADIENT_COLOR = "#FF8C00"
LOSS_COLOR = "#E74C3C"
WEIGHT_COLOR = "#9B59B6"
DIM = "#444455"
SUBTLE = "#333340"
MONO = "Menlo"

# === COLOR MEANINGS ===
# PRIMARY = neurons/activations
# SECONDARY = correct/good
# ACCENT = signal/information flow
# HIGHLIGHT = error/loss
# GRADIENT_COLOR = gradients flowing backward
# WEIGHT_COLOR = weights being updated


class Scene1_Hook(Scene):
    """Hook: How does a neural network learn from its mistakes?"""
    def construct(self):
        self.camera.background_color = BG

        question = Text("How does a neural network", font_size=36, color=WHITE, font=MONO)
        question2 = Text("learn from its mistakes?", font_size=36, color=HIGHLIGHT, font=MONO, weight=BOLD)
        q_group = Group(question, question2).arrange(DOWN, buff=0.3).move_to(UP * 0.5)

        self.play(Write(question), run_time=1.0)
        self.play(Write(question2), run_time=1.0)
        self.wait(2.0)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene2_Network(Scene):
    """Build a simple 3-layer neural network."""
    def construct(self):
        self.camera.background_color = BG

        title = Text("A Simple Neural Network", font_size=28, color=DIM, font=MONO)
        title.to_edge(UP, buff=0.6)
        self.play(FadeIn(title), run_time=0.5)

        # Network structure: 2-3-2-1
        layer_sizes = [2, 3, 2, 1]
        layer_labels = ["Input", "Hidden 1", "Hidden 2", "Output"]
        layer_x = [-4.0, -1.3, 1.3, 4.0]

        all_neurons = []
        all_labels = []

        for i, (size, label, x) in enumerate(zip(layer_sizes, layer_labels, layer_x)):
            layer_neurons = []
            y_positions = np.linspace(-(size - 1) * 0.7, (size - 1) * 0.7, size)
            for y in y_positions:
                neuron = Circle(
                    radius=0.25, color=PRIMARY,
                    fill_opacity=0.15, stroke_width=2
                ).move_to([x, y, 0])
                layer_neurons.append(neuron)
            all_neurons.append(layer_neurons)

            lab = Text(label, font_size=14, color=DIM, font=MONO)
            lab.next_to(Group(*layer_neurons), DOWN, buff=0.5)
            all_labels.append(lab)

        # Draw neurons layer by layer
        for i, layer in enumerate(all_neurons):
            self.play(
                LaggedStart(*[FadeIn(n, scale=0.7) for n in layer], lag_ratio=0.1),
                FadeIn(all_labels[i]),
                run_time=0.6
            )

        self.wait(0.5)

        # Draw connections (weights)
        all_edges = []
        for i in range(len(all_neurons) - 1):
            layer_edges = []
            for n1 in all_neurons[i]:
                for n2 in all_neurons[i + 1]:
                    edge = Line(
                        n1.get_right(), n2.get_left(),
                        color=WEIGHT_COLOR, stroke_width=1.0, stroke_opacity=0.3
                    )
                    layer_edges.append(edge)
            all_edges.append(layer_edges)
            self.play(
                LaggedStart(*[Create(e) for e in layer_edges], lag_ratio=0.02),
                run_time=0.5
            )

        # Label: "Each connection has a weight"
        weight_label = Text("Each connection has a weight", font_size=18, color=WEIGHT_COLOR, font=MONO)
        weight_label.set_stroke(BLACK, width=4, background=True)
        weight_label.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(weight_label, shift=UP * 0.1), run_time=0.5)
        self.wait(1.5)

        # Store everything for later scenes via self.add
        self.wait(0.5)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene3_ForwardPass(Scene):
    """Animate data flowing forward through the network."""
    def construct(self):
        self.camera.background_color = BG

        title = Text("Forward Pass", font_size=28, color=PRIMARY, font=MONO, weight=BOLD)
        title.to_edge(UP, buff=0.6)
        self.play(FadeIn(title), run_time=0.5)

        # Rebuild network (compact)
        layer_sizes = [2, 3, 2, 1]
        layer_x = [-4.0, -1.3, 1.3, 4.0]

        all_neurons = []
        all_edges = []

        for i, (size, x) in enumerate(zip(layer_sizes, layer_x)):
            layer = []
            y_positions = np.linspace(-(size - 1) * 0.7, (size - 1) * 0.7, size)
            for y in y_positions:
                n = Circle(radius=0.22, color=PRIMARY, fill_opacity=0.1, stroke_width=1.5)
                n.move_to([x, y, 0])
                layer.append(n)
            all_neurons.append(layer)

        for layer in all_neurons:
            for n in layer:
                self.add(n)

        for i in range(len(all_neurons) - 1):
            layer_edges = []
            for n1 in all_neurons[i]:
                for n2 in all_neurons[i + 1]:
                    e = Line(n1.get_right(), n2.get_left(),
                             color=SUBTLE, stroke_width=0.8, stroke_opacity=0.3)
                    layer_edges.append(e)
                    self.add(e)
            all_edges.append(layer_edges)

        self.wait(0.3)

        # Animate forward pass: light up neurons layer by layer
        input_label = Text("[0.5, 0.8]", font_size=16, color=ACCENT, font=MONO)
        input_label.next_to(Group(*all_neurons[0]), LEFT, buff=0.4)
        self.play(FadeIn(input_label), run_time=0.3)

        for i, layer in enumerate(all_neurons):
            self.play(
                *[n.animate.set_fill(ACCENT, opacity=0.4) for n in layer],
                run_time=0.4
            )
            if i < len(all_edges):
                # Flash along edges
                for edge in all_edges[i][::3]:  # every 3rd for speed
                    self.play(
                        ShowPassingFlash(
                            edge.copy().set_stroke(ACCENT, width=2, opacity=0.8),
                            time_width=0.4
                        ),
                        run_time=0.15
                    )

        # Output value
        output_label = Text("0.73", font_size=20, color=ACCENT, font=MONO, weight=BOLD)
        output_label.next_to(all_neurons[-1][0], RIGHT, buff=0.4)
        self.play(FadeIn(output_label, scale=1.3), run_time=0.5)

        # Expected vs actual
        expected = Text("Expected: 1.0", font_size=18, color=SECONDARY, font=MONO)
        actual = Text("Got: 0.73", font_size=18, color=HIGHLIGHT, font=MONO)
        comparison = Group(expected, actual).arrange(DOWN, buff=0.2, aligned_edge=LEFT)
        comparison.to_edge(RIGHT, buff=0.5).shift(DOWN * 1.5)

        self.play(FadeIn(comparison), run_time=0.5)
        self.wait(1.0)

        # Loss calculation
        loss_text = Text("Loss = (1.0 - 0.73)^2 = 0.073", font_size=18, color=LOSS_COLOR, font=MONO)
        loss_text.set_stroke(BLACK, width=4, background=True)
        loss_text.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(loss_text, shift=UP * 0.1), run_time=0.5)

        # Flash the output neuron red
        self.play(
            all_neurons[-1][0].animate.set_stroke(LOSS_COLOR, width=3),
            Flash(all_neurons[-1][0].get_center(), color=LOSS_COLOR, flash_radius=0.5),
            run_time=0.5
        )

        self.wait(2.0)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene4_Backprop(Scene):
    """The core: gradients flowing backward through the network."""
    def construct(self):
        self.camera.background_color = BG

        title = Text("Backpropagation", font_size=28, color=GRADIENT_COLOR, font=MONO, weight=BOLD)
        title.to_edge(UP, buff=0.6)
        self.play(FadeIn(title), run_time=0.5)

        # Rebuild network
        layer_sizes = [2, 3, 2, 1]
        layer_x = [-4.0, -1.3, 1.3, 4.0]
        all_neurons = []
        all_edges_flat = []

        for i, (size, x) in enumerate(zip(layer_sizes, layer_x)):
            layer = []
            y_positions = np.linspace(-(size - 1) * 0.7, (size - 1) * 0.7, size)
            for y in y_positions:
                n = Circle(radius=0.22, color=PRIMARY, fill_opacity=0.1, stroke_width=1.5)
                n.move_to([x, y, 0])
                layer.append(n)
                self.add(n)
            all_neurons.append(layer)

        edges_by_layer = []
        for i in range(len(all_neurons) - 1):
            layer_edges = []
            for n1 in all_neurons[i]:
                for n2 in all_neurons[i + 1]:
                    e = Line(n1.get_right(), n2.get_left(),
                             color=SUBTLE, stroke_width=0.8, stroke_opacity=0.3)
                    layer_edges.append(e)
                    self.add(e)
                    all_edges_flat.append(e)
            edges_by_layer.append(layer_edges)

        self.wait(0.3)

        # "The error signal propagates backward"
        error_label = Text("Error signal flows backward", font_size=18, color=GRADIENT_COLOR, font=MONO)
        error_label.set_stroke(BLACK, width=4, background=True)
        error_label.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(error_label), run_time=0.5)

        # Light up output neuron with error
        self.play(
            all_neurons[-1][0].animate.set_fill(LOSS_COLOR, opacity=0.5).set_stroke(LOSS_COLOR, width=2.5),
            run_time=0.5
        )

        # Backward pass: layer by layer, right to left
        gradient_colors = [LOSS_COLOR, GRADIENT_COLOR, "#FFB347", ACCENT]

        for layer_idx in range(len(edges_by_layer) - 1, -1, -1):
            edges = edges_by_layer[layer_idx]
            color = gradient_colors[min(len(edges_by_layer) - 1 - layer_idx, len(gradient_colors) - 1)]

            # Flash backward along edges
            backward_flashes = []
            for edge in edges:
                backward_edge = edge.copy().set_stroke(color, width=2.5, opacity=0.8)
                backward_flashes.append(
                    ShowPassingFlash(backward_edge, time_width=0.5, rate_func=lambda t: 1 - t)
                )

            self.play(
                LaggedStart(*backward_flashes, lag_ratio=0.03),
                run_time=0.8
            )

            # Light up the receiving layer
            receiving_layer = all_neurons[layer_idx]
            self.play(
                *[n.animate.set_fill(color, opacity=0.3).set_stroke(color, width=2) for n in receiving_layer],
                run_time=0.3
            )

        self.wait(1.0)

        # "Each weight learns how much it contributed to the error"
        self.play(FadeOut(error_label), run_time=0.3)
        gradient_label = Text("Each weight learns its contribution to the error", font_size=16, color=GRADIENT_COLOR, font=MONO)
        gradient_label.set_stroke(BLACK, width=4, background=True)
        gradient_label.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(gradient_label, shift=UP * 0.1), run_time=0.5)

        self.wait(2.0)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene5_WeightUpdate(Scene):
    """Zoom into a single weight being updated by the gradient."""
    def construct(self):
        self.camera.background_color = BG

        title = Text("Weight Update", font_size=28, color=WEIGHT_COLOR, font=MONO, weight=BOLD)
        title.to_edge(UP, buff=0.6)
        self.play(FadeIn(title), run_time=0.5)

        # Two big neurons with a connection
        n1 = Circle(radius=0.6, color=PRIMARY, fill_opacity=0.15, stroke_width=2).shift(LEFT * 2.5)
        n2 = Circle(radius=0.6, color=PRIMARY, fill_opacity=0.15, stroke_width=2).shift(RIGHT * 2.5)
        n1_label = Text("a", font_size=28, color=PRIMARY, font=MONO).move_to(n1)
        n2_label = Text("z", font_size=28, color=PRIMARY, font=MONO).move_to(n2)

        weight_line = Line(n1.get_right(), n2.get_left(), color=WEIGHT_COLOR, stroke_width=3)
        weight_val = Text("w = 0.4", font_size=20, color=WEIGHT_COLOR, font=MONO)
        weight_val.next_to(weight_line, UP, buff=0.2)

        self.play(
            FadeIn(n1), FadeIn(n2), FadeIn(n1_label), FadeIn(n2_label),
            Create(weight_line), FadeIn(weight_val),
            run_time=1.0
        )
        self.wait(0.5)

        # Show gradient
        gradient_arrow = Arrow(
            RIGHT * 1.5, LEFT * 0.5,
            color=GRADIENT_COLOR, stroke_width=3
        ).shift(DOWN * 1.2)
        grad_label = Text("gradient = -0.12", font_size=18, color=GRADIENT_COLOR, font=MONO)
        grad_label.next_to(gradient_arrow, DOWN, buff=0.2)

        self.play(GrowArrow(gradient_arrow), FadeIn(grad_label), run_time=0.8)
        self.wait(0.8)

        # Update rule
        rule = Text("w_new = w - lr * gradient", font_size=20, color=WHITE, font=MONO)
        rule.shift(DOWN * 2.5)
        self.play(FadeIn(rule, shift=UP * 0.1), run_time=0.5)
        self.wait(0.5)

        # Animate the calculation
        calc = Text("w_new = 0.4 - 0.01 * (-0.12) = 0.4012", font_size=18, color=ACCENT, font=MONO)
        calc.next_to(rule, DOWN, buff=0.3)
        self.play(FadeIn(calc, shift=UP * 0.1), run_time=0.5)
        self.wait(0.5)

        # Animate weight changing
        new_weight = Text("w = 0.4012", font_size=20, color=ACCENT, font=MONO, weight=BOLD)
        new_weight.move_to(weight_val)
        self.play(
            ReplacementTransform(weight_val, new_weight),
            weight_line.animate.set_color(ACCENT),
            Flash(weight_line.get_center(), color=ACCENT, flash_radius=0.3),
            run_time=0.8
        )

        self.wait(1.5)

        # "Repeat for every weight, every example"
        repeat_text = Text("Repeat for every weight, every training example", font_size=16, color=DIM, font=MONO)
        repeat_text.set_stroke(BLACK, width=4, background=True)
        repeat_text.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(repeat_text), run_time=0.5)
        self.wait(2.0)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene6_LossLandscape(Scene):
    """3-like loss landscape with gradient descent dot rolling to minimum."""
    def construct(self):
        self.camera.background_color = BG

        title = Text("Gradient Descent on the Loss Surface", font_size=24, color=LOSS_COLOR, font=MONO, weight=BOLD)
        title.to_edge(UP, buff=0.6)
        self.play(FadeIn(title), run_time=0.5)

        # Axes for loss curve
        axes = Axes(
            x_range=[-3, 3, 1], y_range=[0, 5, 1],
            x_length=8, y_length=4,
            axis_config={"color": SUBTLE, "stroke_width": 1.5, "include_numbers": False},
            tips=False,
        ).shift(DOWN * 0.3)

        x_label = Text("weight", font_size=16, color=DIM, font=MONO).next_to(axes.x_axis, RIGHT, buff=0.2)
        y_label = Text("loss", font_size=16, color=DIM, font=MONO).next_to(axes.y_axis, UP, buff=0.2)

        # Loss function: a bowl with a local minimum
        def loss_fn(x):
            return 0.3 * (x - 0.5) ** 2 + 0.1 * np.sin(3 * x) + 0.5

        loss_curve = axes.plot(loss_fn, x_range=[-2.8, 2.8], color=LOSS_COLOR, stroke_width=2.5)

        self.play(Create(axes), FadeIn(x_label), FadeIn(y_label), run_time=0.8)
        self.play(Create(loss_curve), run_time=1.5)
        self.wait(0.5)

        # Gradient descent dot
        dot = Dot(color=ACCENT, radius=0.12)
        start_x = 2.2
        dot.move_to(axes.c2p(start_x, loss_fn(start_x)))

        # Trail
        trail = TracedPath(dot.get_center, stroke_color=ACCENT, stroke_width=2, stroke_opacity=0.5)
        self.add(trail)
        self.play(FadeIn(dot, scale=1.5), run_time=0.5)

        # Gradient descent steps
        lr = 0.3
        x_val = start_x
        for step in range(12):
            # Numerical gradient
            grad = (loss_fn(x_val + 0.001) - loss_fn(x_val - 0.001)) / 0.002
            x_val = x_val - lr * grad
            x_val = np.clip(x_val, -2.5, 2.5)

            new_pos = axes.c2p(x_val, loss_fn(x_val))
            speed = max(0.15, 0.4 - step * 0.02)

            self.play(dot.animate.move_to(new_pos), run_time=speed, rate_func=smooth)

        # Flash at minimum
        self.play(
            Flash(dot.get_center(), color=SECONDARY, flash_radius=0.5, num_lines=12),
            run_time=0.5
        )

        min_label = Text("minimum loss", font_size=18, color=SECONDARY, font=MONO)
        min_label.set_stroke(BLACK, width=4, background=True)
        min_label.next_to(dot, DOWN, buff=0.3)
        self.play(FadeIn(min_label, shift=UP * 0.1), run_time=0.5)

        self.wait(2.0)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.5)


class Scene7_Closing(Scene):
    """Summary and closing."""
    def construct(self):
        self.camera.background_color = BG

        steps = [
            ("1", "Forward pass", "compute predictions", PRIMARY),
            ("2", "Calculate loss", "measure the error", LOSS_COLOR),
            ("3", "Backpropagate", "compute gradients", GRADIENT_COLOR),
            ("4", "Update weights", "nudge toward minimum", ACCENT),
            ("5", "Repeat", "until convergence", SECONDARY),
        ]

        all_rows = Group()
        for num, title, desc, color in steps:
            num_t = Text(num, font_size=24, color=color, font=MONO, opacity=0.5)
            title_t = Text(title, font_size=22, color=color, weight=BOLD, font=MONO)
            title_t.next_to(num_t, RIGHT, buff=0.3)
            desc_t = Text(desc, font_size=16, color=DIM, font=MONO)
            desc_t.next_to(title_t, RIGHT, buff=0.4)
            all_rows.add(Group(num_t, title_t, desc_t))

        all_rows.arrange(DOWN, buff=0.4, aligned_edge=LEFT).move_to(ORIGIN).shift(LEFT * 1.5)

        for row in all_rows:
            self.play(FadeIn(row, shift=RIGHT * 0.2), run_time=0.5)
            self.wait(0.3)

        self.wait(1.5)

        # Final message
        closing = Text("Backpropagation", font_size=44, color=GRADIENT_COLOR, font=MONO, weight=BOLD)
        sub = Text("How neural networks learn", font_size=20, color=DIM, font=MONO)
        close_group = Group(closing, sub).arrange(DOWN, buff=0.3)

        self.play(
            FadeOut(all_rows),
            FadeIn(close_group),
            run_time=1.0
        )
        self.wait(2.5)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.8)
